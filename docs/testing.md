# PostgreSQL development and tests

PostgreSQL through psycopg is the application's supported database in every
environment. The driver is installed by the base Python package. CI and the
local Compose helper use PostgreSQL 17. Applied migration files retain their
historical dialect clauses; new code and tests do not support SQLite.

## Local databases

From the repository root:

```bash
docker compose -f infra/compose.local.yaml up -d --wait db
docker compose -f infra/compose.local.yaml --profile tests up -d --wait test-db
```

The application database persists in a Docker volume and listens only on
`127.0.0.1:5433`. Its URL matches `backend/.env.example`. The separate test database
listens only on `127.0.0.1:5434`, uses temporary storage, and is disposable. These
local-only credentials must not be used for a deployment.

An existing local PostgreSQL installation also works. Create separate `radar`
and `radar_test` databases and adjust the URLs/ports. The test role must be able
to create and drop schemas in its dedicated test database.

```bash
cd backend
pip install -e '.[dev]'
export TEST_DATABASE_URL='postgresql+psycopg://radar:radar-local-only@127.0.0.1:5434/radar_test'
python -m pytest -n 2 --dist=loadscope --durations=20 --junitxml=test-results.xml
```

PowerShell uses `$env:TEST_DATABASE_URL = 'postgresql+psycopg://...'` instead of
`export`. pytest deliberately requires this variable for database tests and does
not fall back to the application's `DATABASE_URL` or a local SQLite file. Tests
force `ENVIRONMENT=test` so the API does not start live background workers.

To run sequentially, omit `-n 2 --dist=loadscope` (or pass `-n 0`). For comparison,
use the same machine, dependencies and selected tests, and record both elapsed
time and `--durations` output. CI uploads the JUnit report and summarizes setup,
test-call and cleanup costs. Summed phase times overlap across parallel workers;
the report's elapsed time is the useful end-to-end test measurement.

## Isolation and concurrency

Each pytest process, including each of the two xdist workers, creates its own
randomly named schema. Tables are created once per worker. Between tests, one
schema-qualified `TRUNCATE ... RESTART IDENTITY` clears all application tables.
It intentionally omits `CASCADE`, so a reference from an unrelated schema causes
cleanup to fail rather than delete unrelated rows. The worker drops only its
own schema on exit. Abnormally terminated workers may leave an unused
`radar_test_*` schema in the disposable test database; recreating the local test
container clears it.

Tests use real PostgreSQL transactions, foreign keys, uniqueness constraints,
row locks and separate connections. There is no outer rollback/savepoint that
would hide commits from the threads in checkout, quota, scheduler, verification,
password-recovery and AI-budget race tests. Pure unit tests need no database
connection. API contract generation also imports schemas without connecting.

## Migrating a local SQLite setup

Point `DATABASE_URL` at PostgreSQL and run `alembic upgrade head` to create a fresh
local database. This change does not copy existing SQLite data or delete the old
file; retain it if you need a separate data export/import later. Deployed Compose
environments already use PostgreSQL and need no data migration or new settings.

## CI and GitHub Actions

The required database job remains named **backend (postgres)**; remove an old
**backend (sqlite)** requirement from branch rules if one was configured. Both
database migrations and the container backup/restore checks remain release gates.

All JavaScript Actions in CI and deployment use releases declaring `node24`.
This is the Actions runner runtime, independent of the application's Node 22
frontend build. GitHub-hosted runners provide it; no deployment-server Node.js
installation or warning-suppression variable is needed.
