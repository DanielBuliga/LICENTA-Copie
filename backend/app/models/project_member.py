from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone

from app.db.base import Base


class ProjectMember(Base):
    __tablename__ = "project_members"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    # Keep role as simple string for MVP
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="OWNER")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")

    joined_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    inactive_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    inactive_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
