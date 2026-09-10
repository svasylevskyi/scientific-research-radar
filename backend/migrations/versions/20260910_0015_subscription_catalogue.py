"""Internal versioned subscription plan catalogue."""
from alembic import op
import sqlalchemy as sa

revision = "20260910_0015"
down_revision = "20260909_0014"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("subscription_plan_revisions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(60), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("configuration", sa.JSON(), nullable=False),
        sa.Column("change_note", sa.String(500), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("code", "revision", name="uq_subscription_plan_revision"),
        sa.CheckConstraint("revision > 0", name="ck_subscription_plan_revision_positive"))


def downgrade():
    op.drop_table("subscription_plan_revisions")
