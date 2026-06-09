from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SkillAlias(Base):
    __tablename__ = "skill_aliases"
    __table_args__ = (UniqueConstraint("skill_id", "alias", name="uq_skill_alias"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id"), nullable=False)
    alias: Mapped[str] = mapped_column(String(120), nullable=False)
