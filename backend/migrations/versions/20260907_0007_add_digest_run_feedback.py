"""add digest run feedback

Revision ID: 20260907_0007
Revises: 20260906_0006
Create Date: 2026-09-07
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260907_0007"
down_revision: str | None = "20260906_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("digest_runs") as batch_op:
        batch_op.add_column(
            sa.Column(
                "feedback_context", sa.JSON(), server_default="[]", nullable=False
            )
        )
        batch_op.add_column(sa.Column("feedback_text", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column("feedback_created_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(
            sa.Column("feedback_updated_at", sa.DateTime(timezone=True), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("digest_runs") as batch_op:
        batch_op.drop_column("feedback_updated_at")
        batch_op.drop_column("feedback_created_at")
        batch_op.drop_column("feedback_text")
        batch_op.drop_column("feedback_context")
