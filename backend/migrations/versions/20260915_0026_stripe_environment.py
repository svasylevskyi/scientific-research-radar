"""Bind billing data to one deployment Stripe mode.

Revision ID: 20260915_0026
Revises: 20260914_0025
"""
from alembic import op
import sqlalchemy as sa

revision = "20260915_0026"
down_revision = "20260914_0025"
branch_labels = None
depends_on = None


def upgrade():
    table = op.create_table("stripe_environment",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("mode", sa.String(10), nullable=False))
    # The pre-existing application accepted only sandbox objects.
    if op.get_bind().execute(sa.text("SELECT 1 FROM sandbox_checkouts LIMIT 1")).first():
        op.bulk_insert(table, [{"id": 1, "mode": "sandbox"}])


def downgrade():
    if op.get_bind().execute(sa.text("SELECT 1 FROM stripe_environment WHERE mode = 'live'")).first():
        raise RuntimeError("Cannot remove the mode binding from a live billing database. Keep a live-compatible release.")
    op.drop_table("stripe_environment")
