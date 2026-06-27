"""Add assignment source

Revision ID: a9c4e2f1b8d7
Revises: f1a2b3c4d5e6
Create Date: 2026-06-27 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a9c4e2f1b8d7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "task_assignments",
        sa.Column("assignment_source", sa.String(length=20), nullable=False, server_default="MANUAL"),
    )
    op.alter_column("task_assignments", "assignment_source", server_default=None)


def downgrade() -> None:
    op.drop_column("task_assignments", "assignment_source")
