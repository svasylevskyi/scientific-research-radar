"""Enable dispatch cursors and durable briefing email delivery."""
from datetime import datetime, timezone
import json

from alembic import op
import sqlalchemy as sa

revision = "20260907_0010"
down_revision = "20260907_0009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("digests", sa.Column("schedule_next_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_digests_schedule_next_at", "digests", ["schedule_next_at"])
    op.add_column("digest_runs", sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True))
    op.create_table("digest_email_deliveries",
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("digest_runs.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("claim_token", sa.String(36), nullable=True),
        sa.Column("claimed_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(500), nullable=True),
    )
    op.create_index("ix_digest_email_deliveries_status", "digest_email_deliveries", ["status"])
    table = sa.table("digests", sa.column("id", sa.Uuid()), sa.column("schedule", sa.JSON()), sa.column("schedule_next_at", sa.DateTime(timezone=True)))
    connection = op.get_bind()
    for row in connection.execute(sa.select(table.c.id, table.c.schedule)):
        schedule = row.schedule
        if isinstance(schedule, str):
            schedule = json.loads(schedule)
        if schedule:
            start = datetime.fromisoformat(schedule["starts_at"].replace("Z", "+00:00")).astimezone(timezone.utc)
            connection.execute(table.update().where(table.c.id == row.id).values(schedule_next_at=start))


def downgrade():
    op.drop_table("digest_email_deliveries")
    op.drop_column("digest_runs", "scheduled_for")
    op.drop_index("ix_digests_schedule_next_at", table_name="digests")
    op.drop_column("digests", "schedule_next_at")
