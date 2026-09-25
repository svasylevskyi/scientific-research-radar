"""Retain manual quality evaluations without changing automatic delivery state."""
from alembic import op
import sqlalchemy as sa

revision = "20260925_0029"
down_revision = "20260924_0028"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "research_quality_evaluations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("digest_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_by_name", sa.String(120), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("findings", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('pass', 'warning', 'hold')", name="ck_quality_evaluations_status"),
    )
    op.create_index("idx_quality_evaluations_run_created", "research_quality_evaluations", ["run_id", "created_at"])


def downgrade():
    op.drop_table("research_quality_evaluations")
