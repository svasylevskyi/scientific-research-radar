"""Local free subscriptions and usage without a Stripe checkout."""
from datetime import datetime, timezone
from alembic import op
import sqlalchemy as sa
revision = '20260913_0021'
down_revision = '20260911_0020'
branch_labels = depends_on = None


def upgrade():
    op.create_table('free_subscriptions',
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('plan_revision_id', sa.Integer(), sa.ForeignKey('subscription_plan_revisions.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('anchor', sa.DateTime(timezone=True), nullable=False))
    with op.batch_alter_table('subscription_run_usage') as batch:
        batch.alter_column('checkout_id', existing_type=sa.Uuid(), nullable=True)
    plans = sa.table('subscription_plan_revisions', sa.column('code', sa.String()), sa.column('revision', sa.Integer()),
        sa.column('configuration', sa.JSON()), sa.column('change_note', sa.String()), sa.column('created_at', sa.DateTime(timezone=True)))
    db = op.get_bind()
    if not db.scalar(sa.select(plans.c.revision).where(plans.c.code == 'free').limit(1)):
        config = dict(name='Free', description='Explore one research topic with a monthly research run.', state='reviewed',
            billing_type='free', currency='EUR', monthly_price='0.00', annual_price=None, tax_display='inclusive',
            max_digests=1, max_papers_per_run=10, papers_per_month=10, runs_per_month=1, manual_runs_per_month=1,
            schedule_frequencies=[], email_delivery=False, trial_days=0, stripe_sandbox=None, subscriber_visible=True, display_order=0)
        db.execute(plans.insert().values(code='free', revision=1, configuration=config,
            change_note='Initial permanent Free tier: one monthly run, up to ten papers.', created_at=datetime.now(timezone.utc)))


def downgrade():
    # Never discard already recorded free usage to make an older schema fit.
    db = op.get_bind()
    if db.scalar(sa.text('SELECT count(*) FROM free_subscriptions')) or db.scalar(sa.text('SELECT count(*) FROM subscription_run_usage WHERE checkout_id IS NULL')):
        raise RuntimeError('Cannot downgrade while free-tier enrollments or usage exist; retain this schema or restore a compatible backup.')
    with op.batch_alter_table('subscription_run_usage') as batch:
        batch.alter_column('checkout_id', existing_type=sa.Uuid(), nullable=False)
    op.drop_table('free_subscriptions')
    # Preserve catalogue revisions, which may have been edited after deployment.
