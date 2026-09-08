"""Shared rate limits and refresh rotation state."""
from alembic import op
import sqlalchemy as sa

revision = "20260908_0012"
down_revision = "20260907_0011"
branch_labels = None
depends_on = None


def upgrade():
    op.rename_table("recovery_rate_limits", "rate_limit_buckets")
    op.drop_index("ix_recovery_rate_limits_expires_at", table_name="rate_limit_buckets")
    op.create_index("ix_rate_limit_buckets_expires_at", "rate_limit_buckets", ["expires_at"])
    op.add_column("auth_sessions", sa.Column("previous_token_hash", sa.String(64), nullable=True))
    op.add_column("auth_sessions", sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("auth_sessions", "rotated_at")
    op.drop_column("auth_sessions", "previous_token_hash")
    op.drop_index("ix_rate_limit_buckets_expires_at", table_name="rate_limit_buckets")
    op.rename_table("rate_limit_buckets", "recovery_rate_limits")
    op.create_index("ix_recovery_rate_limits_expires_at", "recovery_rate_limits", ["expires_at"])
