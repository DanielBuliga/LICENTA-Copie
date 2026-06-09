"""remove skill levels and validation add aliases

Revision ID: c4d2f8a91b7e
Revises: 7d9e4a2b6c10
Create Date: 2026-06-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4d2f8a91b7e"
down_revision: Union[str, Sequence[str], None] = "7d9e4a2b6c10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "skill_aliases",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("skill_id", sa.Integer(), nullable=False),
        sa.Column("alias", sa.String(length=120), nullable=False),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("skill_id", "alias", name="uq_skill_alias"),
    )

    op.drop_constraint("fk_user_skills_validated_by_users", "user_skills", type_="foreignkey")
    op.drop_column("user_skills", "validated_at")
    op.drop_column("user_skills", "validated_by")
    op.drop_column("user_skills", "validation_status")
    op.drop_column("user_skills", "level")
    op.drop_column("task_skill_requirements", "min_level")


def downgrade() -> None:
    op.add_column("task_skill_requirements", sa.Column("min_level", sa.Integer(), nullable=False, server_default="1"))
    op.alter_column("task_skill_requirements", "min_level", server_default=None)
    op.add_column("user_skills", sa.Column("level", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("user_skills", sa.Column("validation_status", sa.String(length=20), nullable=False, server_default="PENDING"))
    op.add_column("user_skills", sa.Column("validated_by", sa.Integer(), nullable=True))
    op.add_column("user_skills", sa.Column("validated_at", sa.DateTime(), nullable=True))
    op.create_foreign_key("fk_user_skills_validated_by_users", "user_skills", "users", ["validated_by"], ["id"])
    op.alter_column("user_skills", "level", server_default=None)
    op.alter_column("user_skills", "validation_status", server_default=None)
    op.drop_table("skill_aliases")
