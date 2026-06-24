from datetime import timedelta, datetime
from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.scheduled_block import ScheduledBlock
from app.utils.time_utils import as_utc, utc_naive


def _minutes_between(a: datetime, b: datetime) -> int:
    return int((b - a).total_seconds() // 60)


def pack_task_into_slots(
    db: Session,
    project_id: int,
    task: Task,
    user_id: int,
    slots: list[tuple],
    earliest_start: datetime,
    minutes_to_plan: int | None = None,
) -> tuple[int, int, datetime | None]:
    """
    Create ScheduledBlocks for task in the given slots.

    We compute using UTC-aware datetimes for safe comparisons.
    We store UTC-naive datetimes in MySQL (DATETIME) for consistency.

    earliest_start: do not schedule this task before this time.
    minutes_to_plan: optional remaining effort to place, used by replan.
    Returns: (created_blocks_count, remaining_minutes, last_end_time_utc_aware)
    """
    deadline_utc = as_utc(task.deadline)
    earliest_start_utc = as_utc(earliest_start)

    remaining = task.estimate_minutes if minutes_to_plan is None else max(minutes_to_plan, 0)
    created = 0
    last_end: datetime | None = None

    new_slots: list[tuple] = []

    for s, e in slots:
        s_utc = as_utc(s)
        e_utc = as_utc(e)

        # Keep slots completely before earliest_start (usable for other tasks)
        if e_utc <= earliest_start_utc:
            new_slots.append((s_utc, e_utc))
            continue

        # If slot overlaps earliest_start, keep the left part for other tasks
        if s_utc < earliest_start_utc < e_utc:
            new_slots.append((s_utc, earliest_start_utc))
            s_utc = earliest_start_utc

        # From here, slot is at/after earliest_start
        if remaining <= 0:
            new_slots.append((s_utc, e_utc))
            continue

        # Do not plan after deadline
        if s_utc >= deadline_utc:
            new_slots.append((s_utc, e_utc))
            continue

        end_limit = min(e_utc, deadline_utc)
        if end_limit <= s_utc:
            continue

        slot_minutes = _minutes_between(s_utc, end_limit)
        if slot_minutes <= 0:
            continue

        take = min(slot_minutes, remaining)
        block_end_utc = s_utc + timedelta(minutes=take)

        block = ScheduledBlock(
            project_id=project_id,
            task_id=task.id,
            user_id=user_id,
            start_datetime=utc_naive(s_utc),
            end_datetime=utc_naive(block_end_utc),
            planned_minutes=take,
            block_status="PLANNED",
        )
        db.add(block)
        db.commit()
        db.refresh(block)

        created += 1
        remaining -= take
        last_end = block_end_utc

        # leftover from this slot after taking time
        if block_end_utc < e_utc:
            new_slots.append((block_end_utc, e_utc))

    slots[:] = new_slots
    return created, remaining, last_end
