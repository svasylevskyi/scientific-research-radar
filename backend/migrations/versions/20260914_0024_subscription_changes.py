"""Scheduled subscription transitions and notification outbox."""
from alembic import op
import sqlalchemy as sa
revision = '20260914_0024'
down_revision = '20260913_0023'
branch_labels = depends_on = None


def upgrade():
    op.create_table('subscription_changes',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('checkout_id', sa.Uuid(), sa.ForeignKey('sandbox_checkouts.id', ondelete='CASCADE'), nullable=False),
        *[sa.Column(k, sa.Integer(), sa.ForeignKey('subscription_plan_revisions.id', ondelete='RESTRICT'), nullable=False) for k in ('source_revision_id', 'target_revision_id')],
        *[sa.Column(k, sa.String(255), nullable=False) for k in ('source_price_id', 'target_price_id')],
        *[sa.Column(k, sa.String(10), nullable=False) for k in ('source_interval', 'target_interval')],
        sa.Column('effective_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('state', sa.String(30), nullable=False),
        sa.Column('schedule_id', sa.String(255), unique=True),
        sa.Column('parameters', sa.JSON(), nullable=False), sa.Column('digest_ids', sa.JSON(), nullable=False),
        sa.Column('applied_at', sa.DateTime(timezone=True)), sa.Column('last_error', sa.String(500)),
        sa.Column('attempts', sa.Integer(), nullable=False), sa.Column('next_attempt_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False))
    for key in ('user_id', 'checkout_id'):
        op.create_index('ix_subscription_changes_' + key, 'subscription_changes', [key])
    op.create_index('ix_subscription_change_work', 'subscription_changes', ['state', 'next_attempt_at'])
    op.create_table('billing_notifications',
        sa.Column('id', sa.String(400), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('subject', sa.String(200), nullable=False), sa.Column('text', sa.String(4000), nullable=False),
        sa.Column('state', sa.String(20), nullable=False), sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('next_attempt_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True)), sa.Column('created_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_billing_notifications_user_id', 'billing_notifications', ['user_id'])
    op.create_index('ix_billing_notification_work', 'billing_notifications', ['state', 'next_attempt_at'])
    op.add_column('sandbox_checkouts', sa.Column('notification_state', sa.JSON(), nullable=False, server_default='{}'))
    op.add_column('subscription_account_states', sa.Column('paid_digest_ids', sa.JSON(), nullable=False, server_default='[]'))


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM subscription_changes")):
        raise RuntimeError('Subscription transition history is needed to verify invoices. Retain this schema or restore a reviewed backup.')
    with op.batch_alter_table('sandbox_checkouts') as batch:
        batch.drop_column('notification_state')
    with op.batch_alter_table('subscription_account_states') as batch:
        batch.drop_column('paid_digest_ids')
    op.drop_table('billing_notifications')
    op.drop_table('subscription_changes')
