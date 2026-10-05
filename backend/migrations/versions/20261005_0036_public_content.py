"""Store versioned public-site content managed from administration."""
from alembic import op
import sqlalchemy as sa

revision = "20261005_0036"
down_revision = "20261002_0035"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "public_content_revisions",
        sa.Column("slug", sa.String(length=16), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body_markdown", sa.Text(), nullable=False),
        sa.Column("change_note", sa.String(length=500), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_by_name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("slug IN ('about', 'privacy', 'terms')", name="ck_public_content_slug"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("slug", "revision"),
    )


def downgrade():
    op.drop_table("public_content_revisions")
