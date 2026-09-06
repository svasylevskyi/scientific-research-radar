"""add staged radar run progress and per-owner active-run guard

Revision ID: 20260906_0005
Revises: 20260905_0004
Create Date: 2026-09-06
"""

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID, uuid4

from alembic import op
import sqlalchemy as sa

revision: str = "20260906_0005"
down_revision: str | None = "20260905_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("digest_runs") as batch_op:
        batch_op.add_column(sa.Column("owner_id", sa.Uuid(), nullable=True))

    op.execute(
        sa.text(
            "UPDATE digest_runs "
            "SET owner_id = ("
            "SELECT digests.owner_id FROM digests "
            "WHERE digests.id = digest_runs.digest_id"
            ")"
        )
    )

    with op.batch_alter_table("digest_runs") as batch_op:
        batch_op.alter_column("owner_id", existing_type=sa.Uuid(), nullable=False)
        batch_op.create_foreign_key(
            "fk_digest_runs_owner_id_users",
            "users",
            ["owner_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # An in-process run from the pre-staged implementation cannot survive the
    # deployment/restart needed to apply this migration. Close those runs before
    # adding the per-owner uniqueness guard so they neither block an account nor
    # make the index creation fail when an owner had more than one active digest.
    op.execute(
        sa.text(
            "UPDATE digest_runs "
            "SET status = 'failed', "
            "error_message = 'Radar execution was interrupted by the staged-workflow upgrade.', "
            "completed_at = CURRENT_TIMESTAMP "
            "WHERE status = 'running'"
        )
    )

    op.create_index(
        "idx_digest_runs_owner_created_at",
        "digest_runs",
        ["owner_id", "created_at"],
    )
    if op.get_bind().dialect.name in {"sqlite", "postgresql"}:
        op.create_index(
            "uq_digest_runs_owner_running",
            "digest_runs",
            ["owner_id"],
            unique=True,
            sqlite_where=sa.text("status = 'running'"),
            postgresql_where=sa.text("status = 'running'"),
        )

    with op.batch_alter_table("digest_run_papers") as batch_op:
        batch_op.alter_column(
            "summary_data",
            existing_type=sa.JSON(),
            nullable=True,
        )

    op.create_table(
        "digest_run_stages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("progress_current", sa.Integer(), nullable=False),
        sa.Column("progress_total", sa.Integer(), nullable=False),
        sa.Column("result_data", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("response_ids", sa.JSON(), nullable=False),
        sa.Column("usage_data", sa.JSON(), nullable=False),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("prompt_version", sa.String(length=50), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "stage IN ('discovery_relevance', 'paper_summaries', "
            "'trend_analysis', 'digest_briefing')",
            name="ck_digest_run_stages_stage",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'failed')",
            name="ck_digest_run_stages_status",
        ),
        sa.CheckConstraint(
            "position BETWEEN 1 AND 4",
            name="ck_digest_run_stages_position",
        ),
        sa.CheckConstraint(
            "progress_current >= 0 AND progress_total >= 0 "
            "AND progress_current <= progress_total",
            name="ck_digest_run_stages_progress",
        ),
        sa.ForeignKeyConstraint(["run_id"], ["digest_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "position", name="uq_digest_run_stages_run_position"),
        sa.UniqueConstraint("run_id", "stage", name="uq_digest_run_stages_run_stage"),
    )
    op.create_index(
        "idx_digest_run_stages_run_position",
        "digest_run_stages",
        ["run_id", "position"],
    )

    connection = op.get_bind()
    existing_runs = connection.execute(
        sa.text(
            "SELECT id, status, model_name, prompt_version, openai_response_id, "
            "started_at, completed_at, search_data, relevance_data "
            "FROM digest_runs"
        )
    ).mappings()
    stage_table = sa.table(
        "digest_run_stages",
        sa.column("id", sa.Uuid()),
        sa.column("run_id", sa.Uuid()),
        sa.column("stage", sa.String()),
        sa.column("position", sa.Integer()),
        sa.column("status", sa.String()),
        sa.column("progress_current", sa.Integer()),
        sa.column("progress_total", sa.Integer()),
        sa.column("result_data", sa.JSON()),
        sa.column("error_message", sa.Text()),
        sa.column("response_ids", sa.JSON()),
        sa.column("usage_data", sa.JSON()),
        sa.column("model_name", sa.String()),
        sa.column("prompt_version", sa.String()),
        sa.column("started_at", sa.DateTime(timezone=True)),
        sa.column("completed_at", sa.DateTime(timezone=True)),
    )
    for run in existing_runs:
        run_id = UUID(run["id"]) if isinstance(run["id"], str) else run["id"]
        started_at = (
            datetime.fromisoformat(run["started_at"])
            if isinstance(run["started_at"], str)
            else run["started_at"]
        )
        completed_at = (
            datetime.fromisoformat(run["completed_at"])
            if isinstance(run["completed_at"], str)
            else run["completed_at"]
        )
        completed = run["status"] == "completed"
        failed = run["status"] == "failed"
        has_discovery = bool(run["search_data"] or run["relevance_data"] or completed)
        stages = [
            ("discovery_relevance", has_discovery),
            ("paper_summaries", completed),
            ("trend_analysis", completed),
            ("digest_briefing", completed),
        ]
        failed_assigned = False
        rows = []
        for position, (stage_name, stage_completed) in enumerate(stages, start=1):
            if stage_completed:
                stage_status = "completed"
            elif failed and not failed_assigned:
                stage_status = "failed"
                failed_assigned = True
            else:
                stage_status = "pending"
            terminal = stage_status in {"completed", "failed"}
            rows.append(
                {
                    "id": uuid4(),
                    "run_id": run_id,
                    "stage": stage_name,
                    "position": position,
                    "status": stage_status,
                    "progress_current": 1 if stage_status == "completed" else 0,
                    "progress_total": 1,
                    "result_data": None,
                    "error_message": (
                        "This run failed before staged progress tracking was available."
                        if stage_status == "failed"
                        else None
                    ),
                    "response_ids": (
                        [run["openai_response_id"]]
                        if position == 4 and run["openai_response_id"]
                        else []
                    ),
                    "usage_data": {
                        "input_tokens": 0,
                        "cached_input_tokens": 0,
                        "output_tokens": 0,
                        "reasoning_tokens": 0,
                    },
                    "model_name": run["model_name"],
                    "prompt_version": run["prompt_version"],
                    "started_at": started_at if terminal else None,
                    "completed_at": completed_at if terminal else None,
                }
            )
        connection.execute(stage_table.insert(), rows)


def downgrade() -> None:
    op.drop_index("idx_digest_run_stages_run_position", table_name="digest_run_stages")
    op.drop_table("digest_run_stages")

    with op.batch_alter_table("digest_run_papers") as batch_op:
        op.execute(
            sa.text(
                "UPDATE digest_run_papers SET summary_data = '{}' "
                "WHERE summary_data IS NULL"
            )
        )
        batch_op.alter_column(
            "summary_data",
            existing_type=sa.JSON(),
            nullable=False,
        )

    if op.get_bind().dialect.name in {"sqlite", "postgresql"}:
        op.drop_index("uq_digest_runs_owner_running", table_name="digest_runs")
    op.drop_index("idx_digest_runs_owner_created_at", table_name="digest_runs")
    with op.batch_alter_table("digest_runs") as batch_op:
        batch_op.drop_constraint("fk_digest_runs_owner_id_users", type_="foreignkey")
        batch_op.drop_column("owner_id")
