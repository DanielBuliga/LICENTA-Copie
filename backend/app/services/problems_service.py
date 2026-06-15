from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.scheduled_block import ScheduledBlock
from app.models.task_dependency import TaskDependency
from app.services.eligibility_service import eligible_members_for_task
from app.utils.time_utils import utc_naive


def compute_problems(db: Session, project_id: int) -> list[dict]:
    tasks = db.query(Task).filter(Task.project_id == project_id, Task.status != "CLOSED").all()
    tasks_by_id = {task.id: task for task in tasks}
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
            problems.append(
                {
                    "task_id": t.id,
                    "task_title": t.title,
                    "type": "NO_SKILLS",
                    "reason": "Nu există niciun membru eligibil pe baza skillurilor cerute.",
                    "deadline": t.deadline,
                }
            )

        planned = planned_by_task.get(t.id, 0)
        if planned < t.estimate_minutes:
            problems.append(
                {
                    "task_id": t.id,
                    "task_title": t.title,
                    "type": "AT_RISK",
                    "reason": f"Planificat {planned} min din {t.estimate_minutes} min necesare.",
                    "deadline": t.deadline,
                }
            )

    for d in deps:
        if d.predecessor_task_id not in fully_planned:
            successor = tasks_by_id.get(d.successor_task_id)
            predecessor = tasks_by_id.get(d.predecessor_task_id)
            problems.append(
                {
                    "task_id": d.successor_task_id,
                    "task_title": successor.title if successor else None,
                    "type": "BLOCKED",
                    "reason": f"Blocat de taskul {predecessor.title if predecessor else f'#{d.predecessor_task_id}'}.",
                    "deadline": successor.deadline if successor else None,
                }
            )

    problems = [p for p in problems if p.get("deadline") is not None]

    unique = {}
    for p in problems:
        key = (p["task_id"], p["type"], p["reason"])
        unique[key] = p

    return list(unique.values())
