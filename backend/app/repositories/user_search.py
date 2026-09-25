"""Literal, case-insensitive name/email matching shared by admin lists."""

from sqlalchemy import func, or_
from sqlalchemy.sql.elements import ColumnElement

from app.models.user import User


def user_matches(query: str) -> ColumnElement[bool]:
    value = query.strip().lower()
    return or_(func.lower(User.full_name).contains(value, autoescape=True),
               func.lower(User.email).contains(value, autoescape=True))
