"""add user roles and protected super-admin marker

Revision ID: 20260904_0002
Revises: 20260904_0001
Create Date: 2026-09-04
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260904_0002"
down_revision: str | None = "20260904_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("role", sa.String(length=16), server_default="user", nullable=False)
        )
        batch_op.add_column(
            sa.Column("is_super_admin", sa.Boolean(), server_default=sa.false(), nullable=False)
        )
        batch_op.create_check_constraint(
            "ck_users_role",
            "role IN ('user', 'admin')",
        )
        batch_op.create_check_constraint(
            "ck_users_super_admin_active_admin",
            "NOT is_super_admin OR (role = 'admin' AND is_active)",
        )
        batch_op.create_index("idx_users_role", ["role"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("idx_users_role")
        batch_op.drop_constraint("ck_users_super_admin_active_admin", type_="check")
        batch_op.drop_constraint("ck_users_role", type_="check")
        batch_op.drop_column("is_super_admin")
        batch_op.drop_column("role")
