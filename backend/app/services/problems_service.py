from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.scheduled_block import ScheduledBlock
from app.models.task_dependency import TaskDependency
from app.models.task_assignment import TaskAssignment
from app.models.project_member import ProjectMember
from app.models.user import User
from app.services.eligibility_service import eligible_members_for_task
from app.services.tasks_service import leaf_tasks, task_path
from app.utils.time_utils import utc_naive


def compute_problems(db: Session, project_id: int) -> list[dict]:
    all_tasks = db.query(Task).filter(Task.project_id == project_id).all()
    tasks = [task for task in leaf_tasks(db, project_id) if task.status != "CLOSED"]
    parent_ids = {task.parent_task_id for task in all_tasks if task.parent_task_id is not None}
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
                    "task_path": task_path(db, t),
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
                    "task_path": task_path(db, t),
                    "type": "AT_RISK",
                    "reason": f"Planificat {planned} min din {t.estimate_minutes} min necesare.",
                    "deadline": t.deadline,
                }
            )

        inactive_assignments = (
            db.query(TaskAssignment, ProjectMember, User)
            .join(ProjectMember, ProjectMember.user_id == TaskAssignment.user_id)
            .join(User, User.id == TaskAssignment.user_id)
            .filter(
                TaskAssignment.task_id == t.id,
                ProjectMember.project_id == project_id,
                ProjectMember.status == "INACTIVE",
            )
            .all()
        )
        for assignment, member, user in inactive_assignments:
            if assignment.member_status == "DONE":
                continue
            problems.append(
                {
                    "task_id": t.id,
                    "task_title": t.title,
                    "task_path": task_path(db, t),
                    "type": "INACTIVE_MEMBER",
                    "reason": f"Membrul {user.name or user.email} este inactiv, dar are assignment activ pe acest task.",
                    "deadline": t.deadline,
                }
            )

    for d in deps:
        if d.successor_task_id in parent_ids:
            continue
        if d.predecessor_task_id not in fully_planned:
            successor = tasks_by_id.get(d.successor_task_id)
            predecessor = next((task for task in all_tasks if task.id == d.predecessor_task_id), None)
            problems.append(
                {
                    "task_id": d.successor_task_id,
                    "task_title": successor.title if successor else None,
                    "task_path": task_path(db, successor) if successor else None,
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

    priority = {
        "INACTIVE_MEMBER": 0,
        "NO_SKILLS": 1,
        "BLOCKED": 2,
        "AT_RISK": 3,
    }
    grouped: dict[int, dict] = {}
    for p in unique.values():
        task_id = p["task_id"]
        current = grouped.get(task_id)
        if current is None:
            grouped[task_id] = {
                **p,
                "types": [p["type"]],
                "reasons": [p["reason"]],
            }
            continue

        if p["type"] not in current["types"]:
            current["types"].append(p["type"])
        if p["reason"] not in current["reasons"]:
            current["reasons"].append(p["reason"])
        if priority.get(p["type"], 99) < priority.get(current["type"], 99):
            current["type"] = p["type"]
            current["reason"] = p["reason"]

    for item in grouped.values():
        item["types"].sort(key=lambda value: priority.get(value, 99))

    return list(grouped.values())
