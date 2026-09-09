from datetime import date
from fastapi import APIRouter, HTTPException, Response
from app.api.dependencies import AppSettings, CurrentSuperAdmin, DbSession
from app.services.openai_spending_service import SpendingError, spending_report

router = APIRouter()


@router.get("")
def get_spending(from_date: date, to_date: date, actor: CurrentSuperAdmin,
                 db: DbSession, settings: AppSettings, response: Response):
    response.headers["Cache-Control"] = "no-store"
    try:
        return spending_report(db, settings, from_date, to_date)
    except SpendingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from None
