from datetime import datetime, date, timedelta
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models.availability_window import AvailabilityWindow
from app.models.availability_override import AvailabilityOverride
from app.models.scheduled_block import ScheduledBlock

from app.utils.time_utils import as_utc, local_date_time_to_utc, local_midnight_to_utc, utc_naive


def get_busy_intervals(
    db: Session,
    user_id: int,
    start_dt: datetime,
    end_dt: datetime,
) -> list[tuple[datetime, datetime]]:
    # SQL comparisons should use UTC-naive (MySQL DATETIME)
    start_dt = utc_naive(start_dt)
    end_dt = utc_naive(end_dt)

    blocks = (
        db.query(ScheduledBlock)
        .filter(
            ScheduledBlock.user_id == user_id,
            ScheduledBlock.start_datetime < end_dt,
            ScheduledBlock.end_datetime > start_dt,
        )
        .all()
    )

    # Convert naive datetimes from DB to UTC-aware in Python
    return [(as_utc(b.start_datetime), as_utc(b.end_datetime)) for b in blocks]


def subtract_intervals(
    free: list[tuple[datetime, datetime]],
    busy: list[tuple[datetime, datetime]],
) -> list[tuple[datetime, datetime]]:
    result = free[:]

    for b_start, b_end in busy:
        new_result: list[tuple[datetime, datetime]] = []

        for f_start, f_end in result:
            # No overlap
            if b_end <= f_start or b_start >= f_end:
                new_result.append((f_start, f_end))
                continue

            # Busy covers all
            if b_start <= f_start and b_end >= f_end:
                continue

            # Busy cuts left
            if b_start <= f_start < b_end < f_end:
                new_result.append((b_end, f_end))
                continue

            # Busy cuts right
            if f_start < b_start < f_end <= b_end:
                new_result.append((f_start, b_start))
                continue

            # Busy splits
            if f_start < b_start and b_end < f_end:
                new_result.append((f_start, b_start))
                new_result.append((b_end, f_end))
                continue

        result = new_result

    result.sort(key=lambda x: x[0])
    return result


def build_free_slots_for_user(
    db: Session,
    user_id: int,
    start_day: date,
    horizon_days: int,
) -> list[tuple[datetime, datetime]]:
    start_dt = local_midnight_to_utc(start_day)
    end_dt = start_dt + timedelta(days=horizon_days)

    windows = db.query(AvailabilityWindow).filter(AvailabilityWindow.user_id == user_id).all()

    overrides = (
        db.query(AvailabilityOverride)
        .filter(
            AvailabilityOverride.user_id == user_id,
            AvailabilityOverride.day >= start_day,
            AvailabilityOverride.day < (start_day + timedelta(days=horizon_days)),
        )
        .all()
    )

    overrides_by_day: dict[date, list[AvailabilityOverride]] = defaultdict(list)
    for o in overrides:
        overrides_by_day[o.day].append(o)

    free_intervals: list[tuple[datetime, datetime]] = []

    for i in range(horizon_days):
        day = start_day + timedelta(days=i)
        weekday = day.weekday()  # 0..6

        day_overrides = overrides_by_day.get(day, [])

        # A full-day override removes all recurring availability for that date.
        if any(o.is_unavailable for o in day_overrides):
            continue

        day_free_intervals: list[tuple[datetime, datetime]] = []
        for w in windows:
            if w.weekday != weekday:
                continue
            s = local_date_time_to_utc(day, w.start_time)
            e = local_date_time_to_utc(day, w.end_time)
            if s < e:
                day_free_intervals.append((s, e))

        # Partial overrides are unavailable intervals, so they are subtracted
        # from the recurring windows instead of replacing them.
        unavailable_intervals: list[tuple[datetime, datetime]] = []
        for o in day_overrides:
            if o.is_unavailable or o.start_time is None or o.end_time is None:
                continue
            s = local_date_time_to_utc(day, o.start_time)
            e = local_date_time_to_utc(day, o.end_time)
            if s < e:
                unavailable_intervals.append((s, e))

        free_intervals.extend(subtract_intervals(day_free_intervals, unavailable_intervals))

    free_intervals.sort(key=lambda x: x[0])

    busy = get_busy_intervals(db, user_id, start_dt, end_dt)
    free_intervals = subtract_intervals(free_intervals, busy)

    return free_intervals
