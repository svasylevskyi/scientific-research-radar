from calendar import monthrange
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.schemas.digest_schedule import DigestSchedule


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def occurrence(schedule: DigestSchedule, index: int) -> datetime:
    anchor = schedule.starts_at.astimezone(ZoneInfo(schedule.time_zone))
    if index == 0:
        return schedule.starts_at
    if schedule.frequency in ("daily", "weekly"):
        local = anchor + timedelta(days=index * (1 if schedule.frequency == "daily" else 7))
    else:
        months = index * (1 if schedule.frequency == "monthly" else 3)
        year, month = divmod(anchor.year * 12 + anchor.month - 1 + months, 12)
        local = anchor.replace(year=year, month=month + 1, day=min(anchor.day, monthrange(year, month + 1)[1]))
    # Preserve local wall-clock time. A DST gap shifts forward; a repeated time uses its first occurrence.
    return local.replace(fold=0).astimezone(timezone.utc)


def around(schedule: DigestSchedule, now: datetime) -> tuple[datetime | None, datetime | None]:
    """Latest occurrence <= now and next > now, respecting an exclusive cutoff."""
    now = utc(now)
    if schedule.ends_at is not None and now >= schedule.ends_at:
        return None, None
    anchor = schedule.starts_at.astimezone(ZoneInfo(schedule.time_zone))
    local_now = now.astimezone(anchor.tzinfo)
    if schedule.frequency in ("daily", "weekly"):
        index = max(0, (local_now.date() - anchor.date()).days // (1 if schedule.frequency == "daily" else 7))
    else:
        index = max(0, ((local_now.year - anchor.year) * 12 + local_now.month - anchor.month) // (1 if schedule.frequency == "monthly" else 3))
    while index > 0 and occurrence(schedule, index) > now:
        index -= 1
    while occurrence(schedule, index + 1) <= now:
        index += 1
    candidate = occurrence(schedule, index)
    latest = candidate if candidate <= now else None
    following = occurrence(schedule, index + 1) if latest else candidate
    if schedule.ends_at is not None and following >= schedule.ends_at:
        following = None
    return latest, following


def first_dispatch(schedule: DigestSchedule, now: datetime) -> datetime | None:
    # Saving/editing starts from the next future occurrence, without an immediate catch-up run.
    return around(schedule, now)[1]
