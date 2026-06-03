from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.scheduled_block import ScheduledBlock
from app.models.task_dependency import TaskDependency
from app.services.eligibility_service import eligible_members_for_task
from app.utils.time_utils import utc_naive


def compute_problems(db: Session, project_id: int) -> list[dict]:
    tasks = db.query(Task).filter(Task.project_id == project_id, Task.status != "CLOSED").all()
    deps = db.query(TaskDependency).filter(TaskDependency.project_id == project_id).all()

    planned_by_task: dict[int, int] = {t.id: 0 for t in tasks}

    for t in tasks:
        deadline_naive = utc_naive(t.deadline)

        blocks = (
            db.query(ScheduledBlock)
            .filter(
                ScheduledBlock.project_id == project_id,
                ScheduledBlock.task_id == t.id,
                ScheduledBlock.start_datetime < deadline_naive,
            )
            .all()
        )
        planned_by_task[t.id] = sum(b.planned_minutes for b in blocks)

    fully_planned = {t.id for t in tasks if planned_by_task.get(t.id, 0) >= t.estimate_minutes}

    problems: list[dict] = []

    for t in tasks:
        eligible = eligible_members_for_task(db, project_id, t.id)
        if len(eligible) == 0:
            problems.append({"task_id": t.id, "type": "NO_SKILLS", "reason": "No eligible member (skills)", "deadline": t.deadline})

        planned = planned_by_task.get(t.id, 0)
        if planned < t.estimate_minutes:
            problems.append({"task_id": t.id, "type": "AT_RISK", "reason": f"Planned {planned} min, needed {t.estimate_minutes} min", "deadline": t.deadline})

    for d in deps:
        if d.predecessor_task_id not in fully_planned:
            problems.append(
                {
                    "task_id": d.successor_task_id,
                    "type": "BLOCKED",
                    "reason": f"Blocked by task {d.predecessor_task_id}",
                    "deadline": next((t.deadline for t in tasks if t.id == d.successor_task_id), None),
                }
            )

    problems = [p for p in problems if p.get("deadline") is not None]

    unique = {}
    for p in problems:
        key = (p["task_id"], p["type"], p["reason"])
        unique[key] = p

    return list(unique.values())