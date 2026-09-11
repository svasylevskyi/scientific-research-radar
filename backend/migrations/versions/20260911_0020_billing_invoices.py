"""Minimized invoice observations and bounded reconciliation cursor."""
from alembic import op
import sqlalchemy as sa
revision = '20260911_0020'
down_revision = '20260911_0019'
branch_labels = depends_on = None


def upgrade():
    op.add_column('sandbox_checkouts', sa.Column('latest_invoice_id', sa.String(255)))
    op.add_column('sandbox_checkouts', sa.Column('invoices_checked_at', sa.DateTime(timezone=True)))
    op.add_column('sandbox_checkouts', sa.Column('invoice_history_cursor', sa.String(255)))
    op.add_column('sandbox_checkouts', sa.Column('invoice_history_complete', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table('billing_invoices',
        sa.Column('id', sa.String(255), primary_key=True),
        sa.Column('checkout_id', sa.Uuid(), sa.ForeignKey('sandbox_checkouts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(30), nullable=False), sa.Column('currency', sa.String(3), nullable=False),
        *[sa.Column(name, sa.Integer(), nullable=False) for name in ('amount_due', 'amount_paid', 'amount_remaining', 'attempt_count')],
        sa.Column('billing_reason', sa.String(60), nullable=False),
        *[sa.Column(name, sa.DateTime(timezone=True)) for name in ('period_start', 'period_end', 'paid_at', 'next_payment_attempt')],
        sa.Column('issue', sa.String(500)),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False), sa.Column('observed_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_billing_invoice_checkout_created', 'billing_invoices', ['checkout_id', 'created_at'])


def downgrade():
    op.drop_table('billing_invoices')
    for name in ('invoice_history_complete', 'invoice_history_cursor', 'invoices_checked_at', 'latest_invoice_id'):
        op.drop_column('sandbox_checkouts', name)
