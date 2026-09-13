"""Serialize cross-tier Stripe product ownership without rewriting old revisions."""
from alembic import op
import sqlalchemy as sa

revision = '20260913_0022'
down_revision = '20260913_0021'
branch_labels = depends_on = None


def upgrade():
    op.create_table('stripe_product_claims',
        sa.Column('product_id', sa.String(255), primary_key=True),
        sa.Column('plan_code', sa.String(60), nullable=False))


def downgrade():
    op.drop_table('stripe_product_claims')
