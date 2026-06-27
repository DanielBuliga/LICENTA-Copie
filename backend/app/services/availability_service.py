from datetime import datetime

from sqlalchemy.orm import Session

from app.models.availability_window import AvailabilityWindow
from app.models.availability_override import AvailabilityOverride
from app.utils.time_utils import LOCAL_TZ


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


def cleanup_expired_overrides(db: Session, user_id: int) -> None:
    now = datetime.now(LOCAL_TZ)
    today = now.date()
    current_time = now.time()
    rows = db.query(AvailabilityOverride).filter(AvailabilityOverride.user_id == user_id).all()
    expired_ids = [
        row.id
        for row in rows
        if row.day < today
        or (
            row.day == today
            and not row.is_unavailable
            and row.end_time is not None
            and row.end_time <= current_time
        )
    ]
    if expired_ids:
        db.query(AvailabilityOverride).filter(AvailabilityOverride.id.in_(expired_ids)).delete(synchronize_session=False)
        db.commit()


def list_overrides(db: Session, user_id: int) -> list[AvailabilityOverride]:
    cleanup_expired_overrides(db, user_id)
    return (
        db.query(AvailabilityOverride)
        .filter(AvailabilityOverride.user_id == user_id)
        .order_by(AvailabilityOverride.day.asc(), AvailabilityOverride.start_time.asc())
        .all()
    )


def replace_overrides(db: Session, user_id: int, items: list[dict]) -> list[AvailabilityOverride]:
    cleanup_expired_overrides(db, user_id)
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
