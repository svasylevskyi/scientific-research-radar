"""Durable sandbox webhook inbox and reconciliation jobs."""
from alembic import op
import sqlalchemy as sa
revision = '20260911_0018'
down_revision = '20260910_0017'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('billing_sync_jobs',
        sa.Column('id', sa.String(255), primary_key=True),
        sa.Column('checkout_id', sa.Uuid(), sa.ForeignKey('sandbox_checkouts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(16), nullable=False),
        sa.Column('event_type', sa.String(100)),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('state', sa.String(16), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('failures', sa.Integer(), nullable=False),
        sa.Column('manual_retries', sa.Integer(), nullable=False),
        sa.Column('retried_by', sa.Uuid(), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('retried_at', sa.DateTime(timezone=True)),
        sa.Column('next_attempt_at', sa.DateTime(timezone=True)),
        sa.Column('lease_token', sa.String(36)),
        sa.Column('lease_expires_at', sa.DateTime(timezone=True)),
        sa.Column('last_error', sa.String(500)),
        sa.Column('last_attempt_at', sa.DateTime(timezone=True)),
        sa.Column('last_success_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('webhook', 'reconcile')", name='ck_billing_sync_kind'),
        sa.CheckConstraint("state IN ('pending', 'processing', 'retry', 'failed', 'processed')", name='ck_billing_sync_state'))
    op.create_index('ix_billing_sync_due', 'billing_sync_jobs', ['state', 'next_attempt_at'])
    op.create_index('ix_billing_sync_jobs_checkout_id', 'billing_sync_jobs', ['checkout_id'])
    op.create_index('ix_billing_sync_jobs_user_id', 'billing_sync_jobs', ['user_id'])
    op.create_table('billing_sync_heartbeat', sa.Column('id', sa.Integer(), primary_key=True),
                    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table('billing_sync_jobs')
    op.drop_table('billing_sync_heartbeat')
