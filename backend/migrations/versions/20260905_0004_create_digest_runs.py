"""create digest run history tables

Revision ID: 20260905_0004
Revises: 20260905_0003
Create Date: 2026-09-05
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260905_0004"
down_revision: str | None = "20260905_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "papers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_name", sa.String(length=100), nullable=False),
        sa.Column("external_id", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("authors", sa.JSON(), nullable=False),
        sa.Column("abstract", sa.Text(), nullable=True),
        sa.Column("published_date", sa.Date(), nullable=True),
        sa.Column("url", sa.String(length=1000), nullable=False),
        sa.Column("doi", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_name", "external_id", name="uq_papers_source_external_id"
        ),
    )
    op.create_table(
        "digest_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("digest_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("trigger", sa.String(length=16), nullable=False),
        sa.Column("digest_snapshot", sa.JSON(), nullable=False),
        sa.Column("history_context", sa.JSON(), nullable=False),
        sa.Column("search_data", sa.JSON(), nullable=True),
        sa.Column("relevance_data", sa.JSON(), nullable=True),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("prompt_version", sa.String(length=50), nullable=False),
        sa.Column("openai_response_id", sa.String(length=255), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('running', 'completed', 'failed')",
            name="ck_digest_runs_status",
        ),
        sa.CheckConstraint(
            "trigger IN ('manual', 'scheduled')",
            name="ck_digest_runs_trigger",
        ),
        sa.ForeignKeyConstraint(["digest_id"], ["digests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_digest_runs_digest_created_at", "digest_runs", ["digest_id", "created_at"]
    )
    op.create_index("idx_digest_runs_status", "digest_runs", ["status"])
    op.create_table(
        "digest_run_papers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("paper_id", sa.Uuid(), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("relevance_score", sa.Float(), nullable=False),
        sa.Column("search_data", sa.JSON(), nullable=False),
        sa.Column("relevance_data", sa.JSON(), nullable=False),
        sa.Column("summary_data", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "relevance_score BETWEEN 0 AND 100",
            name="ck_digest_run_papers_relevance_score",
        ),
        sa.CheckConstraint("rank >= 1", name="ck_digest_run_papers_rank"),
        sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["run_id"], ["digest_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "paper_id", name="uq_digest_run_papers_run_paper"),
    )
    op.create_index(
        "idx_digest_run_papers_run_rank", "digest_run_papers", ["run_id", "rank"]
    )
    op.create_table(
        "digest_run_trend_analyses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("overview", sa.Text(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["run_id"], ["digest_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id"),
    )
    op.create_table(
        "digest_run_briefings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("executive_summary", sa.Text(), nullable=False),
        sa.Column("content_markdown", sa.Text(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["run_id"], ["digest_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id"),
    )


def downgrade() -> None:
    op.drop_table("digest_run_briefings")
    op.drop_table("digest_run_trend_analyses")
    op.drop_index("idx_digest_run_papers_run_rank", table_name="digest_run_papers")
    op.drop_table("digest_run_papers")
    op.drop_index("idx_digest_runs_status", table_name="digest_runs")
    op.drop_index("idx_digest_runs_digest_created_at", table_name="digest_runs")
    op.drop_table("digest_runs")
    op.drop_table("papers")
