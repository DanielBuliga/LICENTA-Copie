"""add user skill validation

Revision ID: 7d9e4a2b6c10
Revises: 1a2b3c4d5e6f
Create Date: 2026-05-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7d9e4a2b6c10"
down_revision: Union[str, Sequence[str], None] = "1a2b3c4d5e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_skills", sa.Column("validation_status", sa.String(length=20), nullable=False, server_default="PENDING"))
    op.add_column("user_skills", sa.Column("validated_by", sa.Integer(), nullable=True))
    op.add_column("user_skills", sa.Column("validated_at", sa.DateTime(), nullable=True))
    op.add_column("user_skills", sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_foreign_key("fk_user_skills_validated_by_users", "user_skills", "users", ["validated_by"], ["id"])
    op.alter_column("user_skills", "validation_status", server_default=None)
    op.alter_column("user_skills", "updated_at", server_default=None)


def downgrade() -> None:
    op.drop_constraint("fk_user_skills_validated_by_users", "user_skills", type_="foreignkey")
    op.drop_column("user_skills", "updated_at")
    op.drop_column("user_skills", "validated_at")
    op.drop_column("user_skills", "validated_by")
    op.drop_column("user_skills", "validation_status")
