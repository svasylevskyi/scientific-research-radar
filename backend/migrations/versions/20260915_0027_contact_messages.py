"""Store public contact messages for admin review."""
from alembic import op
import sqlalchemy as sa

revision = "20260915_0027"
down_revision = "20260915_0026"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "contact_messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_contact_messages_created_at", "contact_messages", ["created_at", "id"])


def downgrade():
    op.drop_index("ix_contact_messages_created_at", table_name="contact_messages")
    op.drop_table("contact_messages")
