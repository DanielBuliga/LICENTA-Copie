from sqlalchemy import DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone

from app.db.base import Base


class TaskDependency(Base):
    __tablename__ = "task_dependencies"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "predecessor_task_id",
            "successor_task_id",
            name="uq_task_dependency",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)

    predecessor_task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    successor_task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )