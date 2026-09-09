"""Versioned database-managed radar tariffs."""
from alembic import op
import sqlalchemy as sa

revision = "20260909_0014"
down_revision = "20260909_0013"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("radar_prices",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("model_name", sa.String(100), nullable=False),
        sa.Column("version", sa.String(100), nullable=False),
        sa.Column("pricing", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("model_name", "version", name="uq_radar_price_version"),
    )
    op.create_index("ix_radar_prices_model_name", "radar_prices", ["model_name"])


def downgrade():
    op.drop_index("ix_radar_prices_model_name", table_name="radar_prices")
    op.drop_table("radar_prices")
