"""Store one inactive schedule per digest and make legacy frequency optional."""
from alembic import op
import sqlalchemy as sa

revision = "20260907_0009"
down_revision = "20260907_0008"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("digests") as batch:
        batch.alter_column("frequency", existing_type=sa.String(16), nullable=True)
        batch.add_column(sa.Column("schedule", sa.JSON(), nullable=True))


def downgrade():
    # The old schema requires a frequency, even for unscheduled digests.
    op.execute("UPDATE digests SET frequency = 'weekly' WHERE frequency IS NULL")
    with op.batch_alter_table("digests") as batch:
        batch.drop_column("schedule")
        batch.alter_column("frequency", existing_type=sa.String(16), nullable=False)
