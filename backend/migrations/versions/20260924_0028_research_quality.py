"""Persist quality settings snapshots and deterministic run decisions."""
from alembic import op
import sqlalchemy as sa

revision = "20260924_0028"
down_revision = "20260915_0027"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("research_quality_settings",
        sa.Column("version", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_by_name", sa.String(120), nullable=False),
        sa.Column("change_reason", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.add_column("digest_runs", sa.Column("quality_config", sa.JSON(), nullable=True))
    op.add_column("digest_runs", sa.Column("quality_status", sa.String(20), nullable=False, server_default="not_evaluated"))
    op.add_column("digest_runs", sa.Column("quality_findings", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("digest_runs", sa.Column("quality_evaluated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("digest_runs", sa.Column("quality_delivery_blocked", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    # A rollback must not silently erase delivery protection for held output.
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM digest_runs WHERE quality_delivery_blocked = true")):
        raise RuntimeError("Cannot remove quality gates while held runs exist. Retain a quality-aware release.")
    for name in ("quality_delivery_blocked", "quality_evaluated_at", "quality_findings", "quality_status", "quality_config"):
        op.drop_column("digest_runs", name)
    op.drop_table("research_quality_settings")
