"""Record explicit registration agreement to current Terms and Privacy versions."""
from alembic import op
import sqlalchemy as sa

revision = "20261006_0038"
down_revision = "20261005_0037"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("email_verifications", "users"):
        op.add_column(table, sa.Column("legal_agreement_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, sa.Column("terms_version", sa.String(length=64), nullable=True))
        op.add_column(table, sa.Column("privacy_version", sa.String(length=64), nullable=True))


def downgrade():
    for table in ("users", "email_verifications"):
        op.drop_column(table, "privacy_version")
        op.drop_column(table, "terms_version")
        op.drop_column(table, "legal_agreement_at")
