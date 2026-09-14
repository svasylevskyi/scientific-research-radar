"""Owner-controlled Free preferences; all changes retain saved research."""
from sqlalchemy import select
from app.models.digest import Digest
from app.models.subscription_access import SubscriptionAccountState
from app.services import subscription_access_service as access
from app.services.free_subscription_service import assign
from app.models.subscription_plan import SubscriptionPlanRevision


def free_choices(db, uid, settings):
    current = access.resolve(db, uid, settings)
    if current['mode'] == 'complimentary':
        return {'available': False, 'items': [], 'selected_ids': [], 'limit': 0, 'effective': False}
    state = db.get(SubscriptionAccountState, uid)
    free = assign(db, uid, state.allowance_anchor)
    plan = db.get(SubscriptionPlanRevision, free.plan_revision_id)
    maximum = plan.configuration['max_digests']
    chosen = access.free_digest_ids(db, uid, state, maximum, persist=current['billing_type'] == 'free')
    return {'available': True, 'limit': maximum, 'effective': current['billing_type'] == 'free',
        'selected_ids': chosen, 'plan_name': plan.configuration['name'],
        'items': [{'id': str(d.id), 'topic': d.topic, 'schedule_paused': d.schedule_paused}
                  for d in db.scalars(select(Digest).where(Digest.owner_id == uid).order_by(Digest.created_at.desc(), Digest.id))]}


def choose_free_digests(db, uid, ids, settings):
    data = free_choices(db, uid, settings)
    requested = [str(i) for i in ids]
    available = {d['id'] for d in data['items']}
    if not data['available']:
        raise access.AccessDenied('Free digest preferences are unavailable for complimentary access.', 409)
    if len(set(requested)) != len(requested) or len(requested) != min(data['limit'], len(available)):
        raise access.AccessDenied(f"Choose {min(data['limit'], len(available))} distinct digest(s) for Free.", 422)
    if not set(requested) <= available:
        raise access.AccessDenied('A selected digest was not found in your account.', 404)
    db.get(SubscriptionAccountState, uid).preferred_digest_ids = requested
    db.flush()
    return free_choices(db, uid, settings)
