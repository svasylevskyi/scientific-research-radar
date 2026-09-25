"""Store permission-checked evidence and remove abstracts without permission proof."""
from copy import deepcopy
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "20260925_0031"
down_revision = "20260925_0030"
branch_labels = None
depends_on = None


def without_abstracts(value):
    if isinstance(value, dict):
        return {key: None if key == "abstract" else without_abstracts(item) for key, item in value.items()}
    if isinstance(value, list):
        return [without_abstracts(item) for item in value]
    return value


def upgrade():
    op.create_table("run_source_content",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("digest_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_id", sa.String(500), nullable=False),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.UniqueConstraint("run_id", "external_id", name="uq_run_source_content_paper"))
    op.create_index("ix_run_source_content_run_id", "run_source_content", ["run_id"])
    op.create_table("source_content_cache", sa.Column("key", sa.String(240), primary_key=True),
        sa.Column("document", sa.JSON(), nullable=False), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.add_column("source_provider_state", sa.Column("content_window_started", sa.DateTime(timezone=True)))
    op.add_column("source_provider_state", sa.Column("content_requests", sa.Integer(), server_default="0", nullable=False))
    provider = sa.table("source_provider_state", sa.column("provider"), sa.column("available_at", sa.DateTime(timezone=True)))
    op.bulk_insert(provider, [{"provider": "pmc", "available_at": datetime(2000, 1, 1, tzinfo=timezone.utc)}])
    db = op.get_bind()
    papers = sa.table("papers", sa.column("abstract", sa.Text()))
    db.execute(papers.update().values(abstract=None))
    # Discovery text had no independently verified licence. Remove that field,
    # retaining identifiers, original analyses, assessments, and audit metadata.
    for name, column in [("digest_run_stages", "result_data"), ("digest_runs", "history_context")]:
        table = sa.table(name, sa.column("id", sa.Uuid()), sa.column(column, sa.JSON()))
        for row in db.execute(sa.select(table)).mappings().yield_per(100):
            clean = without_abstracts(row[column])
            if clean != row[column]:
                db.execute(table.update().where(table.c.id == row["id"]).values({column: clean}))
    cache = sa.table("source_metadata_cache", sa.column("key", sa.String()), sa.column("data", sa.JSON()))
    for row in db.execute(sa.select(cache)).mappings().yield_per(100):
        if row["data"].get("provider") == "crossref":
            db.execute(cache.update().where(cache.c.key == row["key"]).values(data=without_abstracts(row["data"])))
    evidence = sa.table("source_verifications", sa.column("id", sa.Uuid()), sa.column("papers", sa.JSON()))
    for row in db.execute(sa.select(evidence)).mappings().yield_per(100):
        clean = deepcopy(row["papers"])
        for paper in clean:
            lookup = paper.get("evidence") or {}
            if lookup.get("provider") == "crossref" and (lookup.get("metadata") or {}).get("abstract"):
                lookup["metadata"]["abstract"] = None
                paper.setdefault("notes", []).append("Previously retained Crossref abstract removed: reuse permission was not verified.")
        if clean != row["papers"]:
            db.execute(evidence.update().where(evidence.c.id == row["id"]).values(papers=clean))


def downgrade():
    op.drop_table("source_content_cache")
    op.drop_table("run_source_content")
    provider = sa.table("source_provider_state", sa.column("provider"))
    op.get_bind().execute(provider.delete().where(provider.c.provider == "pmc"))
    op.drop_column("source_provider_state", "content_requests")
    op.drop_column("source_provider_state", "content_window_started")
    # Removed unlicensed text is deliberately not restored.
