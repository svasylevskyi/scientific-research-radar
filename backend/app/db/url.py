"""The application supports PostgreSQL through psycopg in every environment."""
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


def validate_database_url(value: str) -> str:
    try:
        url = make_url(value)
    except ArgumentError:
        raise ValueError("DATABASE_URL must be a valid postgresql+psycopg URL") from None
    if url.drivername != "postgresql+psycopg" or not url.database:
        raise ValueError("DATABASE_URL must use postgresql+psycopg and name a database")
    return value
