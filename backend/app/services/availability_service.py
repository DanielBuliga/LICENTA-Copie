from sqlalchemy.orm import Session

from app.models.availability_window import AvailabilityWindow
from app.models.availability_override import AvailabilityOverride


def list_windows(db: Session, user_id: int) -> list[AvailabilityWindow]:
    return db.query(AvailabilityWindow).filter(AvailabilityWindow.user_id == user_id).all()


def replace_windows(db: Session, user_id: int, items: list[tuple[int, object, object]]) -> list[AvailabilityWindow]:
    # items: list of (weekday, start_time, end_time)
    db.query(AvailabilityWindow).filter(AvailabilityWindow.user_id == user_id).delete()
    db.commit()

    for weekday, start_time, end_time in items:
        row = AvailabilityWindow(user_id=user_id, weekday=weekday, start_time=start_time, end_time=end_time)
        db.add(row)

    db.commit()
    return list_windows(db, user_id)


def list_overrides(db: Session, user_id: int) -> list[AvailabilityOverride]:
    return db.query(AvailabilityOverride).filter(AvailabilityOverride.user_id == user_id).all()


def replace_overrides(db: Session, user_id: int, items: list[dict]) -> list[AvailabilityOverride]:
    db.query(AvailabilityOverride).filter(AvailabilityOverride.user_id == user_id).delete()
    db.commit()

    for it in items:
        row = AvailabilityOverride(
            user_id=user_id,
            day=it["day"],
            is_unavailable=it["is_unavailable"],
            start_time=it.get("start_time"),
            end_time=it.get("end_time"),
        )
        db.add(row)

    db.commit()
    return list_overrides(db, user_id)