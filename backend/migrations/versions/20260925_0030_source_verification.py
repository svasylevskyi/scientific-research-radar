"""Store metadata verification evidence and shared provider cache/throttles."""
from datetime import datetime, timezone
from alembic import op
import sqlalchemy as sa

revision = "20260925_0030"
down_revision = "20260925_0029"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("source_verifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("digest_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trigger", sa.String(16), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_by_name", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("engine_version", sa.String(20), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("papers", sa.JSON(), nullable=False),
        sa.Column("findings", sa.JSON(), nullable=False),
        sa.CheckConstraint("trigger IN ('automatic', 'manual')", name="ck_source_verification_trigger"))
    op.create_index("idx_source_verifications_run_created", "source_verifications", ["run_id", "created_at"])
    op.create_index("uq_source_verification_automatic", "source_verifications", ["run_id"], unique=True,
        sqlite_where=sa.text("trigger = 'automatic'"), postgresql_where=sa.text("trigger = 'automatic'"))
    op.create_table("source_metadata_cache",
        sa.Column("key", sa.String(240), primary_key=True), sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    table = op.create_table("source_provider_state",
        sa.Column("provider", sa.String(20), primary_key=True),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_token", sa.String(36)))
    op.bulk_insert(table, [{"provider": provider, "available_at": datetime(2000, 1, 1, tzinfo=timezone.utc)} for provider in ("crossref", "arxiv")])


def downgrade():
    op.drop_table("source_provider_state")
    op.drop_table("source_metadata_cache")
    op.drop_table("source_verifications")
