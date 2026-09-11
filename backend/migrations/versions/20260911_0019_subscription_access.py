"""Opt-in sandbox access and separate anniversary-window accounting."""
from alembic import op
import sqlalchemy as sa
revision = '20260911_0019'
down_revision = '20260911_0018'
branch_labels = depends_on = None


def upgrade():
    op.add_column('digests', sa.Column('subscription_retry_at', sa.DateTime(timezone=True)))
    for name in ('period_start', 'billing_anchor', 'delinquent_since', 'active_through'):
        op.add_column('sandbox_checkouts', sa.Column(name, sa.DateTime(timezone=True)))
    op.create_table('subscription_access_policies',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False), sa.Column('mode', sa.String(20), nullable=False),
        sa.Column('created_by', sa.Uuid(), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('change_note', sa.String(500), nullable=False), sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('user_id', 'version', name='uq_access_policy_version'),
        sa.CheckConstraint("mode IN ('complimentary', 'sandbox')", name='ck_access_policy_mode'))
    op.create_index('ix_subscription_access_policies_user_id', 'subscription_access_policies', ['user_id'])
    op.create_table('subscription_run_usage',
        sa.Column('run_key', sa.Uuid(), primary_key=True),
        sa.Column('run_id', sa.Uuid(), sa.ForeignKey('digest_runs.id', ondelete='SET NULL')),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('checkout_id', sa.Uuid(), sa.ForeignKey('sandbox_checkouts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('plan_revision_id', sa.Integer(), sa.ForeignKey('subscription_plan_revisions.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=False), sa.Column('period_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('trigger', sa.String(16), nullable=False), sa.Column('state', sa.String(16), nullable=False),
        sa.Column('requested_papers', sa.Integer(), nullable=False), sa.Column('actual_papers', sa.Integer(), nullable=False),
        sa.Column('request_context', sa.JSON(), nullable=False), sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("state IN ('reserved', 'settled', 'released')", name='ck_access_usage_state'),
        sa.CheckConstraint('requested_papers >= 0 AND actual_papers >= 0', name='ck_access_usage_counts'))
    op.create_index('ix_access_usage_window', 'subscription_run_usage', ['user_id', 'checkout_id', 'period_start'])


def downgrade():
    op.drop_column('digests', 'subscription_retry_at')
    op.drop_table('subscription_run_usage')
    op.drop_table('subscription_access_policies')
    for name in ('period_start', 'billing_anchor', 'delinquent_since', 'active_through'):
        op.drop_column('sandbox_checkouts', name)
