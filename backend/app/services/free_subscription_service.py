"""Local free-tier enrollment. Call inside the registration/account transaction."""
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.models.subscription_access import FreeSubscription, SubscriptionAccessPolicy as Policy


def default_configuration():
    return dict(name='Free', description='Explore one research topic with a monthly research run.', state='reviewed',
        billing_type='free', currency='EUR', monthly_price='0.00', annual_price=None, tax_display='inclusive',
        max_digests=1, max_papers_per_run=10, papers_per_month=10, runs_per_month=1, manual_runs_per_month=1,
        schedule_frequencies=[], email_delivery=False, trial_days=0, stripe_sandbox=None,
        subscriber_visible=True, display_order=0)


def default_plan(db):
    # Draft/archived revisions do not replace the last reviewed registration default.
    plan = db.scalar(select(Plan).where(Plan.code == 'free', Plan.configuration['billing_type'].as_string() == 'free',
        Plan.configuration['state'].as_string() == 'reviewed').order_by(Plan.revision.desc()).limit(1))
    if plan:
        return plan
    if db.scalar(select(Plan.id).where(Plan.code == 'free').limit(1)):
        from app.services.subscription_access_service import AccessDenied
        raise AccessDenied('The registration Free plan needs administrator review.', 503)
    try:
        with db.begin_nested():
            plan = Plan(code='free', revision=1, configuration=default_configuration(),
                change_note='Initial permanent Free tier: one monthly run, up to ten papers.', created_by=None)
            db.add(plan); db.flush()
        return plan
    except IntegrityError:
        # Concurrent first registrations share the same catalogue revision.
        return db.scalar(select(Plan).where(Plan.code == 'free', Plan.revision == 1))


def assign(db, user_id, stamp):
    assigned = db.get(FreeSubscription, user_id)
    if assigned is None:
        assigned = FreeSubscription(user_id=user_id, plan_revision_id=default_plan(db).id, anchor=stamp)
        db.add(assigned); db.flush()
    return assigned


def enroll_registration(db, user):
    assign(db, user.id, user.created_at)
    db.add(Policy(user_id=user.id, version=1, mode='sandbox', created_by=None,
        change_note='Free tier assigned at verified registration; subscription limits enforced.'))
    db.flush()
