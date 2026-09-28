"""Account closure queue and irreversible admission marker."""
from alembic import op
import sqlalchemy as sa

revision = "20260928_0034"
down_revision = "20260925_0033"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("closure_requested_at", sa.DateTime(timezone=True)))
    op.create_check_constraint("ck_users_closure_inactive", "users", "closure_requested_at IS NULL OR NOT is_active")
    op.add_column("contact_messages", sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", name="fk_contact_messages_user_id", ondelete="CASCADE")))
    op.create_index("ix_contact_messages_user_id", "contact_messages", ["user_id"])
    op.create_table("account_closures",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("requested_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.String(24), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.String(500)),
        sa.Column("billing_resolved_at", sa.DateTime(timezone=True)),
        sa.Column("data_removed_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("billing_issues", sa.JSON(), nullable=False),
        sa.Column("unrelated_contact_ids", sa.JSON(), nullable=False),
        sa.Column("notification_email", sa.String(320)),
        sa.Column("notification_deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notice_state", sa.String(24), nullable=False),
        sa.Column("notice_attempts", sa.Integer(), nullable=False),
        sa.Column("notice_next_at", sa.DateTime(timezone=True)),
        sa.Column("acknowledgement_sent_at", sa.DateTime(timezone=True)),
        sa.Column("completion_sent_at", sa.DateTime(timezone=True)))
    op.create_index("ix_account_closures_state", "account_closures", ["state"])
    op.create_index("ix_account_closures_next_attempt_at", "account_closures", ["next_attempt_at"])


def downgrade():
    # Reopening erased accounts is impossible; refuse rollback with closure history.
    if op.get_bind().execute(sa.text("SELECT 1 FROM account_closures LIMIT 1")).first():
        raise RuntimeError("Account closure history exists. Restore forward-compatible code instead of removing the closure guard.")
    op.drop_table("account_closures")
    op.drop_index("ix_contact_messages_user_id", table_name="contact_messages")
    op.drop_column("contact_messages", "user_id")
    op.drop_constraint("ck_users_closure_inactive", "users", type_="check")
    op.drop_column("users", "closure_requested_at")
