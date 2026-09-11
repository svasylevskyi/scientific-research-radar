from datetime import datetime, timezone

from sqlalchemy import select

from app.models.digest_run import DigestRun, DigestRunStatus, DigestRunTrigger
from app.schemas.digest_schedule import DigestSchedule, SchedulePreviewRead
from app.scheduler.recurrence import around, utc
from app.services.rate_limit_service import run_allowance_available_at


def schedule_preview(db, settings, digest, *, now=None):
    now = utc(now or datetime.now(timezone.utc))
    if not digest.schedule:
        return SchedulePreviewRead(state="not_scheduled", as_of=now)
    schedule = DigestSchedule.model_validate(digest.schedule)
    cursor = utc(digest.schedule_next_at) if digest.schedule_next_at else None
    dates = []
    expired = schedule.ends_at is not None and now >= schedule.ends_at
    if cursor is not None and not expired:
        # Match dispatch's coalescing of missed dates into the latest due occurrence.
        candidate = around(schedule, now)[0] if cursor <= now else cursor
        if candidate is not None and candidate >= cursor:
            while len(dates) < 3 and candidate is not None:
                if schedule.ends_at is not None and candidate >= schedule.ends_at:
                    break
                dates.append(candidate)
                candidate = around(schedule, candidate)[1]
    result = SchedulePreviewRead(state="scheduled" if dates else "ended", as_of=now,
        time_zone=schedule.time_zone, send_email=schedule.send_email,
        upcoming_runs=dates, next_scheduled_at=dates[0] if dates else None, exhausted=not dates)
    active = db.scalar(select(DigestRun).where(DigestRun.owner_id == digest.owner_id,
        DigestRun.status.in_((DigestRunStatus.QUEUED, DigestRunStatus.RUNNING))))
    if active is not None and active.digest_id == digest.id and active.trigger == DigestRunTrigger.SCHEDULED:
        result.state = str(active.status)
        result.active_run_id = active.id
    elif dates and dates[0] <= now:
        result.allowance_available_at = run_allowance_available_at(db, settings, digest.owner_id, now)
        if active is not None:
            result.state = "waiting_for_run"
            result.waiting_digest_id = active.digest_id
        elif result.allowance_available_at is not None:
            result.state = "waiting_for_allowance"
        else:
            # An overdue cursor is not proof that a job has been queued or a worker is healthy.
            result.state = "due"
    if dates and active is None:
        from app.services.subscription_access_service import assess
        access, issues = assess(db, digest.owner_id, digest.maximum_papers, 'scheduled', digest.schedule, settings)
        if issues:
            result.state = "waiting_for_subscription"
            result.subscription_message = ' '.join(issues)
    return result
