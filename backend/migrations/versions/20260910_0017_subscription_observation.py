"""Observation-only plan assignments and durable run allowances."""
from alembic import op
import sqlalchemy as sa
revision = '20260910_0017'
down_revision = '20260910_0016'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('subscription_observation_accounts',
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('lock_version', sa.Integer(), nullable=False),
        sa.Column('tracking_since', sa.DateTime(timezone=True), nullable=False))
    op.execute(sa.text('INSERT INTO subscription_observation_accounts (user_id, version, lock_version, tracking_since) SELECT id, 0, 0, CURRENT_TIMESTAMP FROM users'))
    op.create_table('subscription_observation_assignments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('plan_revision_id', sa.Integer(), sa.ForeignKey('subscription_plan_revisions.id', ondelete='RESTRICT')),
        sa.Column('created_by', sa.Uuid(), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('change_note', sa.String(500), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('user_id', 'version', name='uq_observation_assignment_version'))
    op.create_index('ix_subscription_observation_assignments_user_id', 'subscription_observation_assignments', ['user_id'])
    op.create_table('subscription_observed_runs',
        sa.Column('run_key', sa.Uuid(), primary_key=True),
        sa.Column('run_id', sa.Uuid(), sa.ForeignKey('digest_runs.id', ondelete='SET NULL')),
        sa.Column('digest_id', sa.Uuid(), sa.ForeignKey('digests.id', ondelete='SET NULL')),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('assignment_id', sa.Integer(), sa.ForeignKey('subscription_observation_assignments.id', ondelete='SET NULL')),
        sa.Column('topic', sa.String(200), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('trigger', sa.String(16), nullable=False),
        sa.Column('state', sa.String(16), nullable=False),
        sa.Column('requested_papers', sa.Integer(), nullable=False),
        sa.Column('actual_papers', sa.Integer(), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('assessments', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("state IN ('reserved', 'settled', 'released')", name='ck_observed_run_state'),
        sa.CheckConstraint('requested_papers >= 0 AND actual_papers >= 0 AND attempts >= 1', name='ck_observed_run_counts'))
    op.create_index('ix_observed_user_period', 'subscription_observed_runs', ['user_id', 'period_start'])


def downgrade():
    op.drop_table('subscription_observed_runs')
    op.drop_table('subscription_observation_assignments')
    op.drop_table('subscription_observation_accounts')
