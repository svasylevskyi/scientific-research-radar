import os
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import build_engine
from app.models.user import User
from postgres_database import clear_database, isolated_database


@pytest.mark.parametrize("url", ["sqlite://", "sqlite:///old.db", "mysql://localhost/radar", "postgresql://localhost/radar", "postgresql+psycopg://localhost/"])
def test_unsupported_database_urls_fail_before_connecting(url):
    with pytest.raises(ValueError, match="postgresql\\+psycopg"):
        Settings(database_url=url)
    with pytest.raises(ValueError, match="postgresql\\+psycopg"):
        build_engine(url)


def test_commits_cross_connections_but_not_schema_boundaries(postgres_database):
    engine, schema = postgres_database
    with Session(engine) as writer:
        writer.add(User(id=uuid4(), email="isolation@example.com", full_name="Isolated", password_hash="unused"))
        writer.commit()
    try:
        with engine.connect() as first, engine.connect() as second:
            assert first.exec_driver_sql("SELECT pg_backend_pid()").scalar() != second.exec_driver_sql("SELECT pg_backend_pid()").scalar()
            assert second.scalar(select(func.count()).select_from(User)) == 1
            assert second.exec_driver_sql("SELECT current_schema()").scalar() == schema
        with isolated_database(os.environ["TEST_DATABASE_URL"]) as (other, other_schema):
            assert other_schema != schema
            with other.connect() as reader:
                assert reader.scalar(select(func.count()).select_from(User)) == 0
            clear_database(other, other_schema)
            with engine.connect() as reader:
                assert reader.scalar(select(func.count()).select_from(User)) == 1
    finally:
        clear_database(engine, schema)


def test_cleanup_removes_committed_rows_without_recreating_tables(db_session_factory, postgres_database):
    engine, schema = postgres_database
    with engine.connect() as connection:
        table_oid = connection.exec_driver_sql("SELECT 'users'::regclass::oid").scalar()
    with db_session_factory() as db:
        db.add(User(id=uuid4(), email="cleanup@example.com", full_name="Cleanup", password_hash="unused"))
        db.commit()
    clear_database(engine, schema)
    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0
    with engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT 'users'::regclass::oid").scalar() == table_oid
