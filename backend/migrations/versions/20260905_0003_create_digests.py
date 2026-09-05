"""create digests table

Revision ID: 20260905_0003
Revises: 20260904_0002
Create Date: 2026-09-05
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260905_0003"
down_revision: str | None = "20260904_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "digests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("topic", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=300), nullable=True),
        sa.Column("include_keywords", sa.JSON(), nullable=False),
        sa.Column("exclude_keywords", sa.JSON(), nullable=False),
        sa.Column("target_audience", sa.JSON(), nullable=False),
        sa.Column("reporting_from", sa.Date(), nullable=False),
        sa.Column("reporting_to", sa.Date(), nullable=False),
        sa.Column("frequency", sa.String(length=16), nullable=False),
        sa.Column("maximum_papers", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "frequency IN ('daily', 'weekly', 'monthly', 'quarterly')",
            name="ck_digests_frequency",
        ),
        sa.CheckConstraint(
            "maximum_papers BETWEEN 1 AND 30", name="ck_digests_maximum_papers"
        ),
        sa.CheckConstraint(
            "reporting_from <= reporting_to", name="ck_digests_reporting_period"
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_digests_owner_created_at", "digests", ["owner_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("idx_digests_owner_created_at", table_name="digests")
    op.drop_table("digests")
