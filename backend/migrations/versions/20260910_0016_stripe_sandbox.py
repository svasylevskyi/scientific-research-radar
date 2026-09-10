"""Admin-only Stripe sandbox checkout and event accounting."""
from alembic import op
import sqlalchemy as sa
revision = "20260910_0016"
down_revision = "20260910_0015"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("sandbox_billing_accounts",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("lock_version", sa.Integer(), nullable=False))
    op.create_table("sandbox_checkouts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_revision_id", sa.Integer(), sa.ForeignKey("subscription_plan_revisions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("interval", sa.String(10), nullable=False),
        sa.Column("price_id", sa.String(255), nullable=False),
        sa.Column("parameters", sa.JSON(), nullable=False),
        sa.Column("checkout_id", sa.String(255), unique=True),
        sa.Column("checkout_status", sa.String(30), nullable=False),
        sa.Column("subscription_id", sa.String(255), unique=True),
        sa.Column("subscription_status", sa.String(30)),
        sa.Column("customer_id", sa.String(255)),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False),
        sa.Column("price_matches", sa.Boolean(), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True)),
        sa.Column("observed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_sandbox_checkouts_user_id", "sandbox_checkouts", ["user_id"])
    op.create_table("sandbox_stripe_events",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column("checkout_id", sa.Uuid(), sa.ForeignKey("sandbox_checkouts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("sandbox_stripe_events")
    op.drop_index("ix_sandbox_checkouts_user_id", table_name="sandbox_checkouts")
    op.drop_table("sandbox_checkouts")
    op.drop_table("sandbox_billing_accounts")
