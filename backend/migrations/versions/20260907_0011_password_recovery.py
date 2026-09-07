"""Single-use password recovery tokens and immediate session revocation."""
from alembic import op
import sqlalchemy as sa

revision = "20260907_0011"
down_revision = "20260907_0010"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("auth_version", sa.Integer(), nullable=False, server_default="0"))
    op.create_table("password_resets",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("credential_fingerprint", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_password_resets_expires_at", "password_resets", ["expires_at"])
    op.create_table("recovery_rate_limits",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_recovery_rate_limits_expires_at", "recovery_rate_limits", ["expires_at"])


def downgrade():
    op.drop_table("recovery_rate_limits")
    op.drop_table("password_resets")
    op.drop_column("users", "auth_version")
