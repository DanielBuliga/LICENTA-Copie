"""create project activity logs

Revision ID: e6a7b8c9d0e1
Revises: d5f6a7b8c9d0
Create Date: 2026-06-17 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "d5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_activity_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=60), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=True),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_project_activity_logs_project_id", "project_activity_logs", ["project_id"], unique=False)
    op.execute(
        """
        INSERT INTO project_activity_logs
            (project_id, actor_id, event_type, entity_type, entity_id, title, details, created_at)
        SELECT
            id,
            created_by,
            'PROJECT_CREATED',
            'PROJECT',
            id,
            CONCAT('Proiect creat: ', title),
            CONCAT('Proiectul ', title, ' a fost creat.'),
            created_at
        FROM projects
        """
    )


def downgrade() -> None:
    op.drop_index("ix_project_activity_logs_project_id", table_name="project_activity_logs")
    op.drop_table("project_activity_logs")
