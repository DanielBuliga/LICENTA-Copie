"""add message notification preference

Revision ID: 1a2b3c4d5e6f
Revises: 8cf7a7d1f0a2
Create Date: 2026-05-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "1a2b3c4d5e6f"
down_revision: Union[str, Sequence[str], None] = "8cf7a7d1f0a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "notification_preferences",
        sa.Column("message_events_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.alter_column("notification_preferences", "message_events_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("notification_preferences", "message_events_enabled")
