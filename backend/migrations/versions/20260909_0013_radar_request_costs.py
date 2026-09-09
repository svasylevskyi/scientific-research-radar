"""Persist request usage independently from accepted radar output."""
from alembic import op
import sqlalchemy as sa

revision = "20260909_0013"
down_revision = "20260908_0012"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("radar_requests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("digest_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stage_id", sa.Uuid(), sa.ForeignKey("digest_run_stages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("response_id", sa.String(255), unique=True),
        sa.Column("model_name", sa.String(100), nullable=False),
        sa.Column("reasoning_effort", sa.String(20), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("outcome", sa.String(30), nullable=False),
        sa.Column("usage", sa.JSON()),
        sa.Column("web_search_calls", sa.Integer()),
        sa.Column("service_tier", sa.String(30)),
        sa.Column("pricing", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("observed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_radar_requests_run_id", "radar_requests", ["run_id"])


def downgrade():
    op.drop_index("ix_radar_requests_run_id", table_name="radar_requests")
    op.drop_table("radar_requests")
