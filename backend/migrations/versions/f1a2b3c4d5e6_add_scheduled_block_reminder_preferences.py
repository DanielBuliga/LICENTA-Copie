"""Add scheduled block reminder preferences

Revision ID: f1a2b3c4d5e6
Revises: e6a7b8c9d0e1
Create Date: 2026-06-25 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "notification_preferences",
        sa.Column("scheduled_block_reminders_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "notification_preferences",
        sa.Column("scheduled_block_reminder_minutes", sa.String(length=100), nullable=False, server_default="60,15"),
    )
    op.alter_column("notification_preferences", "scheduled_block_reminders_enabled", server_default=None)
    op.alter_column("notification_preferences", "scheduled_block_reminder_minutes", server_default=None)


def downgrade() -> None:
    op.drop_column("notification_preferences", "scheduled_block_reminder_minutes")
    op.drop_column("notification_preferences", "scheduled_block_reminders_enabled")
