"""Manual AI observations, conservative reservations and paid request evidence."""
from datetime import date

from alembic import op
import sqlalchemy as sa

revision = "20260925_0033"
down_revision = "20260925_0032"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("claim_review_budget", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("serial", sa.Integer(), nullable=False), sa.Column("day", sa.Date(), nullable=False),
        sa.Column("reserved_usd", sa.Numeric(14, 6), nullable=False), sa.Column("reserved_calls", sa.Integer(), nullable=False))
    table = sa.table("claim_review_budget", sa.column("id"), sa.column("serial"), sa.column("day", sa.Date()),
        sa.column("reserved_usd"), sa.column("reserved_calls"))
    op.bulk_insert(table, [dict(id=1, serial=0, day=date(2026, 9, 25), reserved_usd=0, reserved_calls=0)])
    op.create_table("claim_reviews", sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("digest_runs.id", ondelete="CASCADE")),
        sa.Column("publication_id", sa.Uuid(), sa.ForeignKey("benchmark_publications.id", ondelete="CASCADE")),
        sa.Column("active_key", sa.String(20), unique=True), sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_by_name", sa.String(120), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)), sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("lease_token", sa.String(36)), sa.Column("settings_version", sa.Integer(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False), sa.Column("pricing", sa.JSON(), nullable=False),
        sa.Column("prompt_version", sa.String(40), nullable=False), sa.Column("input_sha256", sa.String(64), nullable=False),
        sa.Column("inputs", sa.JSON(), nullable=False), sa.Column("total_claims", sa.Integer(), nullable=False),
        sa.Column("reserved_usd", sa.Numeric(14, 6), nullable=False), sa.Column("context", sa.JSON(), nullable=False),
        sa.Column("report", sa.JSON()), sa.Column("error", sa.String(500)))
    op.create_index("ix_claim_reviews_run_id", "claim_reviews", ["run_id"])
    op.create_index("ix_claim_reviews_publication_id", "claim_reviews", ["publication_id"])
    op.create_table("claim_review_requests", sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("review_id", sa.Uuid(), sa.ForeignKey("claim_reviews.id", ondelete="CASCADE"), nullable=False),
        sa.Column("case_id", sa.String(120), nullable=False), sa.Column("response_id", sa.String(255)),
        sa.Column("model_name", sa.String(100), nullable=False), sa.Column("reasoning_effort", sa.String(20), nullable=False),
        sa.Column("status", sa.String(30), nullable=False), sa.Column("outcome", sa.String(30), nullable=False),
        sa.Column("usage", sa.JSON()), sa.Column("web_search_calls", sa.Integer()), sa.Column("service_tier", sa.String(30)),
        sa.Column("pricing", sa.JSON()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True)), sa.Column("result", sa.JSON()), sa.Column("latency_seconds", sa.Float()),
        sa.UniqueConstraint("review_id", "case_id", name="uq_claim_review_request_case"))
    op.create_index("ix_claim_review_requests_review_id", "claim_review_requests", ["review_id"])


def downgrade():
    op.drop_table("claim_review_requests")
    op.drop_table("claim_reviews")
    op.drop_table("claim_review_budget")
