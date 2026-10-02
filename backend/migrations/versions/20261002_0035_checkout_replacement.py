"""Persist checkout replacement intent without changing saved Stripe parameters."""
from alembic import op
import sqlalchemy as sa

revision = "20261002_0035"
down_revision = "20260928_0034"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("sandbox_checkouts", sa.Column("replacement_intent", sa.JSON(), nullable=True))


def downgrade():
    if op.get_bind().execute(sa.text(
        "SELECT 1 FROM sandbox_checkouts WHERE replacement_intent->>'state' = 'pending' LIMIT 1"
    )).first():
        raise RuntimeError("Unfinished checkout replacement exists; reconcile it before removing its safety fence.")
    op.drop_column("sandbox_checkouts", "replacement_intent")
