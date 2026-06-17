"""add soft delete statuses

Revision ID: d5f6a7b8c9d0
Revises: c4d2f8a91b7e
Create Date: 2026-06-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "c4d2f8a91b7e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("status", sa.String(length=20), nullable=False, server_default="ACTIVE"))
    op.add_column("users", sa.Column("deactivated_at", sa.DateTime(), nullable=True))
    op.add_column("project_members", sa.Column("status", sa.String(length=20), nullable=False, server_default="ACTIVE"))
    op.add_column("project_members", sa.Column("inactive_at", sa.DateTime(), nullable=True))
    op.add_column("project_members", sa.Column("inactive_reason", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("project_members", "inactive_reason")
    op.drop_column("project_members", "inactive_at")
    op.drop_column("project_members", "status")
    op.drop_column("users", "deactivated_at")
    op.drop_column("users", "status")
