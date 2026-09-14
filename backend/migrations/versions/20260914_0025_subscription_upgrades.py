"""Durable upgrade previews, payment intents and proration evidence."""
from alembic import op
import sqlalchemy as sa
revision = '20260914_0025'
down_revision = '20260914_0024'
branch_labels = depends_on = None


def upgrade():
    op.create_table('subscription_upgrades',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('checkout_id', sa.Uuid(), sa.ForeignKey('sandbox_checkouts.id', ondelete='CASCADE'), nullable=False),
        *[sa.Column(k, sa.Integer(), sa.ForeignKey('subscription_plan_revisions.id', ondelete='RESTRICT'), nullable=False) for k in ('source_revision_id', 'target_revision_id')],
        *[sa.Column(k, sa.String(255), nullable=False) for k in ('source_price_id', 'target_price_id', 'item_id', 'source_invoice_id')],
        sa.Column('invoice_id', sa.String(255), unique=True), sa.Column('interval', sa.String(10), nullable=False),
        *[sa.Column(k, sa.DateTime(timezone=True), nullable=False) for k in ('period_start', 'period_end', 'proration_at', 'expires_at', 'created_at')],
        *[sa.Column(k, sa.DateTime(timezone=True)) for k in ('submitted_at', 'applied_at', 'pending_until', 'next_attempt_at')],
        sa.Column('state', sa.String(30), nullable=False), sa.Column('quote', sa.JSON(), nullable=False),
        sa.Column('parameters', sa.JSON(), nullable=False), sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('last_error', sa.String(500)))
    for key in ('user_id', 'checkout_id'):
        op.create_index('ix_subscription_upgrades_' + key, 'subscription_upgrades', [key])
    op.create_index('ix_subscription_upgrade_work', 'subscription_upgrades', ['state', 'next_attempt_at'])


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM subscription_upgrades WHERE submitted_at IS NOT NULL")):
        raise RuntimeError('Keep submitted upgrade history for payment and historical invoice verification, or restore a reviewed backup.')
    op.drop_table('subscription_upgrades')
