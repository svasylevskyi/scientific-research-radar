"""add durable radar job leases and resumable OpenAI responses

Revision ID: 20260906_0006
Revises: 20260906_0005
Create Date: 2026-09-06
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260906_0006"
down_revision: str | None = "20260906_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("digest_runs") as batch_op:
        batch_op.drop_constraint("ck_digest_runs_status", type_="check")
        batch_op.create_check_constraint(
            "ck_digest_runs_status",
            "status IN ('queued', 'running', 'completed', 'failed')",
        )
        batch_op.add_column(sa.Column("worker_id", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(
            sa.Column("request_count", sa.Integer(), server_default="0", nullable=False)
        )

    if op.get_bind().dialect.name in {"sqlite", "postgresql"}:
        op.drop_index("uq_digest_runs_owner_running", table_name="digest_runs")
        op.create_index(
            "uq_digest_runs_owner_active",
            "digest_runs",
            ["owner_id"],
            unique=True,
            sqlite_where=sa.text("status IN ('queued', 'running')"),
            postgresql_where=sa.text("status IN ('queued', 'running')"),
        )
    op.create_index(
        "idx_digest_runs_dispatch",
        "digest_runs",
        ["status", "lease_expires_at", "created_at"],
    )
    with op.batch_alter_table("digest_run_stages") as batch_op:
        batch_op.add_column(
            sa.Column("active_response_id", sa.String(length=255), nullable=True)
        )

    # Existing in-process work cannot still be executing after this deployment.
    # Requeue it so the durable worker can resume from persisted completed stages.
    op.execute(
        sa.text(
            "UPDATE digest_runs SET status = 'queued', worker_id = NULL, "
            "lease_expires_at = NULL WHERE status = 'running'"
        )
    )
    op.execute(
        sa.text(
            "UPDATE digest_run_stages SET status = 'pending', started_at = NULL "
            "WHERE status = 'running'"
        )
    )


def downgrade() -> None:
    # Queued work cannot be represented by the previous schema.
    op.execute(
        sa.text(
            "UPDATE digest_runs SET status = 'failed', "
            "error_message = 'Radar run interrupted by schema downgrade', "
            "completed_at = CURRENT_TIMESTAMP WHERE status = 'queued'"
        )
    )
    with op.batch_alter_table("digest_run_stages") as batch_op:
        batch_op.drop_column("active_response_id")
    op.drop_index("idx_digest_runs_dispatch", table_name="digest_runs")
    if op.get_bind().dialect.name in {"sqlite", "postgresql"}:
        op.drop_index("uq_digest_runs_owner_active", table_name="digest_runs")
        op.create_index(
            "uq_digest_runs_owner_running",
            "digest_runs",
            ["owner_id"],
            unique=True,
            sqlite_where=sa.text("status = 'running'"),
            postgresql_where=sa.text("status = 'running'"),
        )
    with op.batch_alter_table("digest_runs") as batch_op:
        batch_op.drop_column("request_count")
        batch_op.drop_column("lease_expires_at")
        batch_op.drop_column("worker_id")
        batch_op.drop_constraint("ck_digest_runs_status", type_="check")
        batch_op.create_check_constraint(
            "ck_digest_runs_status", "status IN ('running', 'completed', 'failed')"
        )
