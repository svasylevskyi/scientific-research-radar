"""Authenticated benchmark reviews, criteria history and immutable publications."""

from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
from uuid import UUID

from alembic import op
import sqlalchemy as sa

revision = "20260925_0032"
down_revision = "20260925_0031"
branch_labels = None
depends_on = None


def audit_columns():
    return [sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
            sa.Column("created_by_name", sa.String(120), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False)]


def upgrade():
    op.create_table("research_benchmarks", sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("fingerprint", sa.String(64), unique=True, nullable=False),
        sa.Column("dataset", sa.JSON(), nullable=False), sa.Column("criteria", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False), *audit_columns())
    op.create_table("benchmark_case_reviews", sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("benchmark_id", sa.Uuid(), sa.ForeignKey("research_benchmarks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("case_id", sa.String(120), nullable=False), sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(20), nullable=False), sa.Column("content", sa.JSON(), nullable=False),
        *audit_columns(), sa.UniqueConstraint("benchmark_id", "case_id", "version", name="uq_benchmark_case_version"))
    op.create_table("benchmark_criteria_history", sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("benchmark_id", sa.Uuid(), sa.ForeignKey("research_benchmarks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False), sa.Column("criteria", sa.JSON(), nullable=False),
        *audit_columns(), sa.UniqueConstraint("benchmark_id", "revision", name="uq_benchmark_criteria_revision"))
    op.create_table("benchmark_publications", sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("benchmark_id", sa.Uuid(), sa.ForeignKey("research_benchmarks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False), sa.Column("source_revision", sa.Integer(), nullable=False),
        sa.Column("reviews", sa.JSON(), nullable=False), sa.Column("criteria", sa.JSON(), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False), sa.Column("reason", sa.String(2000), nullable=False),
        *audit_columns(), sa.UniqueConstraint("benchmark_id", "number", name="uq_benchmark_publication_number"))
    # A frozen migration asset, included by the existing Docker COPY migrations.
    seed = json.loads((Path(__file__).parents[1] / "data/20260925_0032_benchmark.json").read_text())
    data = seed["benchmark"]
    content_hash = sha256(json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    table = sa.table("research_benchmarks", sa.column("id", sa.Uuid()), sa.column("fingerprint"),
        sa.column("dataset", sa.JSON()), sa.column("criteria", sa.JSON()), sa.column("revision"),
        sa.column("created_by_name"), sa.column("created_at", sa.DateTime(timezone=True)))
    op.bulk_insert(table, [dict(id=UUID("f8e263e4-84eb-4ae7-8b22-5730a5c58e11"), fingerprint=content_hash,
        dataset=data, criteria=seed["criteria"], revision=0, created_by_name="Built-in draft benchmark",
        created_at=datetime.now(timezone.utc))])


def downgrade():
    op.drop_table("benchmark_publications")
    op.drop_table("benchmark_criteria_history")
    op.drop_table("benchmark_case_reviews")
    op.drop_table("research_benchmarks")
