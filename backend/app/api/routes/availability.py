from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.auth_deps import get_current_user
from app.schemas.availability import WindowsUpdate, OverridesUpdate
from app.services.availability_service import (
    list_windows,
    replace_windows,
    list_overrides,
    replace_overrides,
)
from app.services.availability_impact_service import find_availability_conflict_blocks
from app.services.notification_service import notify_availability_plan_impact
from app.utils.time_utils import LOCAL_TZ

router = APIRouter(prefix="/users/me", tags=["availability"])


def has_overlaps(items: list[tuple[int, object, object]]) -> bool:
    by_day: dict[int, list[tuple[object, object]]] = {}
    for weekday, start, end in items:
        by_day.setdefault(weekday, []).append((start, end))
    for ranges in by_day.values():
        ranges.sort(key=lambda item: item[0])
        for index in range(1, len(ranges)):
            if ranges[index][0] < ranges[index - 1][1]:
                return True
    return False


def override_within_windows(weekday_windows, start_time, end_time) -> bool:
    return any(start <= start_time and end_time <= end for start, end in weekday_windows)


def validate_override_duplicates(items: list[dict]) -> None:
    by_day: dict[object, list[dict]] = {}
    for item in items:
        by_day.setdefault(item["day"], []).append(item)

    for day, day_items in by_day.items():
        unavailable_count = sum(1 for item in day_items if item["is_unavailable"])
        if unavailable_count > 1:
            raise HTTPException(status_code=400, detail="Există deja o excepție de indisponibilitate pentru această zi")
        if unavailable_count and len(day_items) > 1:
            raise HTTPException(status_code=400, detail="O zi indisponibilă nu poate avea și intervale parțiale")

        ranges = [
            (item["start_time"], item["end_time"])
            for item in day_items
            if not item["is_unavailable"]
        ]
        if len(set(ranges)) != len(ranges):
            raise HTTPException(status_code=400, detail="Există deja o excepție cu același interval")
        ranges.sort(key=lambda item: item[0])
        for index in range(1, len(ranges)):
            if ranges[index][0] < ranges[index - 1][1]:
                raise HTTPException(status_code=400, detail="Excepțiile din aceeași zi nu se pot suprapune")


def local_today():
    return datetime.now(LOCAL_TZ).date()


def notify_availability_conflicts(db: Session, user_id: int, conflicts: list) -> None:
    counts_by_project: dict[int, int] = {}
    block_ids_by_project: dict[int, list[int]] = {}
    seen_block_ids: set[int] = set()
    for block, task in conflicts:
        if block.id in seen_block_ids:
            continue
        seen_block_ids.add(block.id)
        counts_by_project[task.project_id] = counts_by_project.get(task.project_id, 0) + 1
        block_ids_by_project.setdefault(task.project_id, []).append(block.id)
    for project_id, count in counts_by_project.items():
        signature = "-".join(str(block_id) for block_id in sorted(block_ids_by_project.get(project_id, [])))
        notify_availability_plan_impact(db, project_id, user_id, count, signature)


@router.get("/availability-windows")
def get_my_windows(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    rows = list_windows(db, current_user.id)
    return [
        {"weekday": r.weekday, "start_time": r.start_time, "end_time": r.end_time}
        for r in rows
    ]


@router.put("/availability-windows")
def put_my_windows(payload: WindowsUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    items = []
    for w in payload.windows:
        if w.start_time >= w.end_time:
            raise HTTPException(status_code=400, detail="Invalid window: start_time must be < end_time")
        items.append((w.weekday, w.start_time, w.end_time))
    if has_overlaps(items):
        raise HTTPException(status_code=400, detail="Availability windows cannot overlap on the same day")

    conflicts = find_availability_conflict_blocks(db, current_user.id, windows=items)
    rows = replace_windows(db, current_user.id, items)
    notify_availability_conflicts(db, current_user.id, conflicts)
    return [
        {"weekday": r.weekday, "start_time": r.start_time, "end_time": r.end_time}
        for r in rows
    ]


@router.get("/availability-overrides")
def get_my_overrides(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    rows = list_overrides(db, current_user.id)
    return [
        {
            "day": r.day,
            "is_unavailable": r.is_unavailable,
            "start_time": r.start_time,
            "end_time": r.end_time,
        }
        for r in rows
    ]


@router.put("/availability-overrides")
def put_my_overrides(payload: OverridesUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    items: list[dict] = []
    windows_by_weekday: dict[int, list[tuple[object, object]]] = {}
    for window in list_windows(db, current_user.id):
        windows_by_weekday.setdefault(window.weekday, []).append((window.start_time, window.end_time))

    for o in payload.overrides:
        if o.day < local_today():
            raise HTTPException(status_code=400, detail="Excepțiile de disponibilitate nu pot fi setate în trecut")
        if o.is_unavailable:
            items.append({"day": o.day, "is_unavailable": True})
            continue

        if o.start_time is None or o.end_time is None:
            raise HTTPException(status_code=400, detail="Override needs start_time and end_time")
        if o.start_time >= o.end_time:
            raise HTTPException(status_code=400, detail="Invalid override: start_time must be < end_time")
        weekday = o.day.weekday()
        if not override_within_windows(windows_by_weekday.get(weekday, []), o.start_time, o.end_time):
            raise HTTPException(status_code=400, detail="Override interval must be inside an availability window for that day")

        items.append(
            {
                "day": o.day,
                "is_unavailable": False,
                "start_time": o.start_time,
                "end_time": o.end_time,
            }
        )

    validate_override_duplicates(items)
    conflicts = find_availability_conflict_blocks(db, current_user.id, overrides=items)
    rows = replace_overrides(db, current_user.id, items)
    notify_availability_conflicts(db, current_user.id, conflicts)
    return [
        {
            "day": r.day,
            "is_unavailable": r.is_unavailable,
            "start_time": r.start_time,
            "end_time": r.end_time,
        }
        for r in rows
    ]
