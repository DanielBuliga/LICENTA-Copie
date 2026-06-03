from datetime import date, time

from sqlalchemy import Date, Time, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AvailabilityOverride(Base):
    __tablename__ = "availability_overrides"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    # Specific date
    day: Mapped[date] = mapped_column(Date, nullable=False)

    # If is_unavailable = True, ignore start/end and treat day as fully unavailable
    is_unavailable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)