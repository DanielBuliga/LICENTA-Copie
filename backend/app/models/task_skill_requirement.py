from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TaskSkillRequirement(Base):
    __tablename__ = "task_skill_requirements"
    __table_args__ = (UniqueConstraint("task_id", "skill_id", name="uq_task_skill_req"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id"), nullable=False)
