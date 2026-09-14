"""Account allowance clock and retained subscription schedule pauses."""
from alembic import op
import sqlalchemy as sa
revision = '20260913_0023'
down_revision = '20260913_0022'
branch_labels = depends_on = None


def upgrade():
    state = op.create_table('subscription_account_states',
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('allowance_anchor', sa.DateTime(timezone=True), nullable=False),
        sa.Column('preferred_digest_ids', sa.JSON(), nullable=False),
        sa.Column('effective_type', sa.String(16)),
        sa.Column('fallback_since', sa.DateTime(timezone=True)))
    op.add_column('digests', sa.Column('schedule_paused', sa.Boolean(), server_default=sa.false(), nullable=False))
    db = op.get_bind()
    free = sa.table('free_subscriptions', sa.column('user_id', sa.Uuid()), sa.column('anchor', sa.DateTime(timezone=True)))
    paid = sa.table('sandbox_checkouts', sa.column('user_id', sa.Uuid()), sa.column('id', sa.Uuid()),
        sa.column('subscription_id', sa.String()), sa.column('billing_anchor', sa.DateTime(timezone=True)), sa.column('created_at', sa.DateTime(timezone=True)))
    # Preserve the currently used paid clock, otherwise the existing Free clock.
    anchors = {r.user_id: (r.anchor, 'free') for r in db.execute(sa.select(free))}
    seen = set()
    for r in db.execute(sa.select(paid).where(paid.c.subscription_id.is_not(None)).order_by(paid.c.created_at.desc(), paid.c.id.desc())):
        if r.user_id in seen:
            continue
        seen.add(r.user_id)
        if r.billing_anchor:
            anchors[r.user_id] = (r.billing_anchor, 'stripe')
    for uid, (anchor, kind) in anchors.items():
        db.execute(state.insert().values(user_id=uid, allowance_anchor=anchor, effective_type=kind, preferred_digest_ids=[]))


def downgrade():
    # Application usage/history stays intact; do not silently reactivate paused schedules.
    db = op.get_bind()
    if db.scalar(sa.text('SELECT count(*) FROM digests WHERE schedule_paused = true')):
        raise RuntimeError('Resume or remove paused schedules before downgrading; otherwise keep this schema.')
    with op.batch_alter_table('digests') as batch:
        batch.drop_column('schedule_paused')
    op.drop_table('subscription_account_states')
