from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.availability_override import AvailabilityOverride
from app.models.availability_window import AvailabilityWindow
from app.models.scheduled_block import ScheduledBlock
from app.models.task import Task
from app.utils.time_utils import LOCAL_TZ, as_utc, utc_naive


def _group_windows(windows) -> dict[int, list[tuple]]:
    grouped: dict[int, list[tuple]] = defaultdict(list)
    for window in windows:
        weekday = window.weekday if hasattr(window, "weekday") else window[0]
        start_time = window.start_time if hasattr(window, "start_time") else window[1]
        end_time = window.end_time if hasattr(window, "end_time") else window[2]
        grouped[weekday].append((start_time, end_time))
    for ranges in grouped.values():
        ranges.sort(key=lambda item: item[0])
    return grouped


def _group_overrides(overrides) -> dict:
    grouped: dict = defaultdict(list)
    for override in overrides:
        if isinstance(override, dict):
            day = override["day"]
            is_unavailable = override.get("is_unavailable", False)
            start_time = override.get("start_time")
            end_time = override.get("end_time")
        else:
            day = override.day
            is_unavailable = override.is_unavailable
            start_time = override.start_time
            end_time = override.end_time
        grouped[day].append((is_unavailable, start_time, end_time))
    return grouped


def _block_within_availability(
    block: ScheduledBlock,
    windows_by_weekday: dict[int, list[tuple]],
    overrides_by_day: dict,
) -> bool:
    local_start = as_utc(block.start_datetime).astimezone(LOCAL_TZ)
    local_end = as_utc(block.end_datetime).astimezone(LOCAL_TZ)
    if local_start.date() != local_end.date():
        return False

    day = local_start.date()
    start_time = local_start.time().replace(second=0, microsecond=0)
    end_time = local_end.time().replace(second=0, microsecond=0)
    day_overrides = overrides_by_day.get(day, [])

    weekday_windows = windows_by_weekday.get(day.weekday(), [])
    if not any(start <= start_time and end_time <= end for start, end in weekday_windows):
        return False

    if not day_overrides:
        return True

    if any(is_unavailable for is_unavailable, _, _ in day_overrides):
        return False

    return not any(
        override_start is not None
        and override_end is not None
        and start_time < override_end
        and end_time > override_start
        for _, override_start, override_end in day_overrides
    )


def find_availability_conflict_blocks(
    db: Session,
    user_id: int,
    windows: list | None = None,
    overrides: list | None = None,
) -> list[tuple[ScheduledBlock, Task]]:
    now = utc_naive(datetime.now(timezone.utc))
    if windows is None:
        windows = db.query(AvailabilityWindow).filter(AvailabilityWindow.user_id == user_id).all()
    if overrides is None:
        overrides = db.query(AvailabilityOverride).filter(AvailabilityOverride.user_id == user_id).all()

    windows_by_weekday = _group_windows(windows)
    overrides_by_day = _group_overrides(overrides)

    rows = (
        db.query(ScheduledBlock, Task)
        .join(Task, Task.id == ScheduledBlock.task_id)
        .filter(
            ScheduledBlock.user_id == user_id,
            ScheduledBlock.block_status == "PLANNED",
            ScheduledBlock.end_datetime > now,
            Task.status.notin_(["CLOSED", "READY_TO_CLOSE"]),
        )
        .all()
    )

    return [
        (block, task)
        for block, task in rows
        if not _block_within_availability(block, windows_by_weekday, overrides_by_day)
    ]
