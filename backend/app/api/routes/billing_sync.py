from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Query
from app.api.dependencies import CurrentAdmin, DbSession, AppSettings
from app.api.routes.stripe_sandbox import call, limit as rate_limit
from app.services import billing_sync_service as sync

router = APIRouter()


@router.get('')
def overview(actor: CurrentAdmin, db: DbSession, user_id: UUID | None = None,
             state: Literal['pending', 'processing', 'retry', 'failed', 'processed'] | None = None,
             offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100)):
    return sync.overview(db, actor, user_id=user_id, state=state, offset=offset, limit=limit)


@router.post('/{job_id}/retry', status_code=202)
def retry(job_id: str, actor: CurrentAdmin, db: DbSession, settings: AppSettings):
    rate_limit(db, settings, actor)
    return call(db, sync.retry, actor, job_id)


@router.get('/checkouts/{checkout_id}/invoices')
def invoices(checkout_id: UUID, actor: CurrentAdmin, db: DbSession, settings: AppSettings,
             offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100)):
    from sqlalchemy import func, select
    from fastapi import HTTPException
    from app.models.stripe_sandbox import SandboxCheckout
    from app.models.user import User
    from app.models.billing_invoice import BillingInvoice
    from app.services.billing_invoice_service import serialized, assessment
    from app.services.subscription_access_service import resolve
    row = db.scalar(select(SandboxCheckout).join(User, User.id == SandboxCheckout.user_id)
        .where(SandboxCheckout.id == checkout_id, sync.visible(actor)))
    if not row:
        raise HTTPException(404, 'Checkout not found')
    query = select(BillingInvoice).where(BillingInvoice.checkout_id == row.id)
    access = resolve(db, row.user_id, settings)
    payment = assessment(db, row, sync.now(), settings.subscription_grace_days)
    discrepancies = []
    if row.subscription_status == 'active' and not payment['covered']:
        discrepancies.append('Stripe reports active, but the current invoice does not verify a settled current period.')
    if payment['covered'] and row.subscription_status != 'active':
        discrepancies.append('The current invoice is settled, but the subscription is not active. Review its lifecycle state.')
    if payment['issue']:
        discrepancies.append(payment['issue'])
    return {'items': [serialized(r) for r in db.scalars(query.order_by(BillingInvoice.created_at.desc(), BillingInvoice.id).offset(offset).limit(limit))],
        'total': db.scalar(select(func.count()).select_from(query.subquery())), 'latest_invoice_id': row.latest_invoice_id,
        'checked_at': row.invoices_checked_at, 'history_complete': row.invoice_history_complete,
        'discrepancies': discrepancies, 'payment': payment,
        'account_access': {'mode': access['mode'], 'allowed': access['allowed'], 'reason': access['reason']}}
