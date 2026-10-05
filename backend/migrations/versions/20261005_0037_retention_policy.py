"""Apply approved contact-message retention metadata."""
from alembic import op
import sqlalchemy as sa

revision = "20261005_0037"
down_revision = "20261005_0036"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "contact_messages",
        sa.Column("retention_hold", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(
        "ix_contact_messages_retention_reviewed",
        "contact_messages",
        ["retention_hold", "reviewed_at"],
    )


def downgrade():
    op.drop_index("ix_contact_messages_retention_reviewed", table_name="contact_messages")
    op.drop_column("contact_messages", "retention_hold")
