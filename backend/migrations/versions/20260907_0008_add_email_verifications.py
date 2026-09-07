"""Add temporary email verification challenges; existing accounts remain active."""
from alembic import op
import sqlalchemy as sa

revision = "20260907_0008"
down_revision = "20260907_0007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "email_verifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, unique=True),
        sa.Column("full_name", sa.String(120), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("code_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
    )
    op.create_index("ix_email_verifications_expires_at", "email_verifications", ["expires_at"])


def downgrade():
    op.drop_table("email_verifications")
