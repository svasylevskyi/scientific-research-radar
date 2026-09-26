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

The rollout comparison on GitHub-hosted runners measured 234.08s for the previous
723-test PostgreSQL suite, 156.01s for the updated 730-test suite sequentially, and
110.90s with two workers. The latter two ran consecutively in the same job. These
are pytest elapsed times, not total CI/deployment durations; runner load and
caches vary. Two workers remain the conservative default, with no tests removed.

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

### PR check selection

CI starts for every PR update. A small `Select CI checks` job reads the complete
Git diff between the PR's merge base and head, including deletions and both paths
of renames. Selection does not use workflow-level path filters or a truncated
GitHub file-list response.

| Changed files | Required PR jobs |
| --- | --- |
| Allowlisted documentation only | Deployment/configuration tests and local Compose validation |
| Frontend source, public assets, tests, or `index.html`, optionally with documentation | Deployment/configuration checks, frontend tests/build and API contract verification, container smoke/backup/restore checks |
| Backend, dependencies, build configuration, infrastructure, workflows, or unknown paths | All validation jobs, including PostgreSQL regressions, migrations, type checks, and benchmark validation |

Documentation means `docs/**/*.md`, root `README.md` and `SECURITY_REVIEW.md`,
`backend/EMAIL.md`, and `infra/README.md`. Runtime prompts and test fixtures are
not documentation exemptions. Frontend package manifests, lockfiles, scripts,
Docker/Caddy files and build configuration require full checks. Empty diffs,
unavailable history, and malformed event data also choose full validation.
The job summary explains the selected profile and required jobs.

Every push to `main` runs **all** validation jobs regardless of changed files.
The `CI passed` gate verifies the selector succeeded, every required job
succeeded, and every excluded job was explicitly skipped. Missing results,
unexpected skips, failures, and cancellations cannot produce a passing gate.
The gate runs even when a prerequisite fails or is skipped.

Image publication on `main` depends on this gate and the tested container images.
Deployment still requires the entire successful main CI run, including
publication, for the exact commit and run attempt. A green PR gate alone does
not authorize a deployment.

### Required-check configuration (one-time repository setting)

After this PR has a successful **CI passed** check, update the ruleset or branch
protection for `main`: require **CI passed** from GitHub Actions and remove the
old individual CI check requirements (`backend (postgres)`, `backend-static`,
`frontend`, `containers`, and `deployment-config`, if present). Remove the retired
`backend (sqlite)` check if it is still listed. Keep unrelated required checks,
review rules, and other protections. This repository setting is not changed by
merging a workflow file. Existing job names remain visible for diagnostics.

The policy and gate regression tests run with
`python3 -m unittest discover -s infra/tests -v` from the repository root and need
neither PostgreSQL nor third-party Python packages.
When adding a validation job, update the policy's job list, the profiles that
require it, and the aggregate gate's `needs` list together.

### Action runtimes

All JavaScript Actions in CI and deployment use releases declaring `node24`.
This is the Actions runner runtime, independent of the application's Node 22
frontend build. GitHub-hosted runners provide it; no deployment-server Node.js
installation or warning-suppression variable is needed.
