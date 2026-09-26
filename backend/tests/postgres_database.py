"""Reusable PostgreSQL schemas for tests that need real commits/connections."""
from contextlib import contextmanager
from uuid import uuid4

from sqlalchemy import create_engine

from app.db.base import Base
from app.db.url import validate_database_url


@contextmanager
def isolated_database(database_url):
    validate_database_url(database_url)
    schema = "radar_test_" + uuid4().hex
    admin = create_engine(database_url, connect_args={"connect_timeout": 10})
    engine = None
    created = False
    try:
        with admin.begin() as connection:
            connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
        created = True
        engine = create_engine(database_url, pool_pre_ping=True, connect_args={
            "connect_timeout": 10,
            "options": f"-c search_path={schema} -c lock_timeout=10000 -c statement_timeout=30000",
        })
        Base.metadata.create_all(engine)
        yield engine, schema
    finally:
        if engine is not None:
            engine.dispose()
        try:
            if created:
                with admin.begin() as connection:
                    connection.exec_driver_sql("SET LOCAL lock_timeout = '10s'")
                    connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
        finally:
            admin.dispose()


def clear_database(engine, schema):
    # Name every table and schema explicitly. Avoid CASCADE: a foreign key from
    # another schema must fail cleanup rather than delete unrelated data.
    quote = engine.dialect.identifier_preparer.quote_identifier
    tables = ", ".join(f"{quote(schema)}.{quote(table.name)}" for table in Base.metadata.tables.values())
    with engine.begin() as connection:
        connection.exec_driver_sql(f"TRUNCATE TABLE {tables} RESTART IDENTITY")
