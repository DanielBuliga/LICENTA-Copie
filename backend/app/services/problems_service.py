from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.project_member import ProjectMember
from app.models.scheduled_block import ScheduledBlock
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.task_dependency import TaskDependency
from app.models.user import User
from app.services.eligibility_service import eligible_members_for_task
from app.services.tasks_service import leaf_tasks, task_path
from app.utils.time_utils import utc_naive


def compute_problems(db: Session, project_id: int) -> list[dict]:
    all_tasks = db.query(Task).filter(Task.project_id == project_id).all()
    tasks = [task for task in leaf_tasks(db, project_id) if task.status not in {"CLOSED", "READY_TO_CLOSE"}]
    parent_ids = {task.parent_task_id for task in all_tasks if task.parent_task_id is not None}
    tasks_by_id = {task.id: task for task in tasks}
    deps = db.query(TaskDependency).filter(TaskDependency.project_id == project_id).all()
    now_naive = utc_naive(datetime.now(timezone.utc))

    planned_by_task: dict[int, int] = {t.id: 0 for t in tasks}
    missed_by_task: dict[int, int] = {t.id: 0 for t in tasks}

    for task in tasks:
        deadline_naive = utc_naive(task.deadline)
        blocks = (
            db.query(ScheduledBlock)
            .filter(
                ScheduledBlock.project_id == project_id,
                ScheduledBlock.task_id == task.id,
                ScheduledBlock.start_datetime < deadline_naive,
            )
            .all()
        )
        planned_by_task[task.id] = sum(
            block.planned_minutes
            for block in blocks
            if block.block_status == "DONE" or block.end_datetime >= now_naive
        )
        missed_by_task[task.id] = sum(
            block.planned_minutes
            for block in blocks
            if block.block_status == "PLANNED" and block.end_datetime < now_naive
        )

    fully_planned = {task.id for task in tasks if planned_by_task.get(task.id, 0) >= task.estimate_minutes}
    problems: list[dict] = []

    for task in tasks:
        deadline_naive = utc_naive(task.deadline)
        missed = missed_by_task.get(task.id, 0)
        if missed > 0:
            problems.append(
                {
                    "task_id": task.id,
                    "task_title": task.title,
                    "task_path": task_path(db, task),
                    "type": "MISSED_PLANNED_WORK",
                    "reason": f"{missed} min planificate au trecut fără să fie marcate ca realizate.",
                    "deadline": task.deadline,
                }
            )

        if deadline_naive <= now_naive:
            problems.append(
                {
                    "task_id": task.id,
                    "task_title": task.title,
                    "task_path": task_path(db, task),
                    "type": "DEADLINE_PASSED",
                    "reason": "Deadline-ul a trecut; taskul nu mai poate fi replanificat fără modificarea deadline-ului.",
                    "deadline": task.deadline,
                }
            )

        eligible = eligible_members_for_task(db, project_id, task.id)
        if len(eligible) == 0:
            problems.append(
                {
                    "task_id": task.id,
                    "task_title": task.title,
                    "task_path": task_path(db, task),
                    "type": "NO_SKILLS",
                    "reason": "Nu există niciun membru eligibil pe baza skillurilor cerute.",
                    "deadline": task.deadline,
                }
            )

        planned = planned_by_task.get(task.id, 0)
        if planned < task.estimate_minutes:
            problems.append(
                {
                    "task_id": task.id,
                    "task_title": task.title,
                    "task_path": task_path(db, task),
                    "type": "AT_RISK",
                    "reason": f"Planificat {planned} min din {task.estimate_minutes} min necesare.",
                    "deadline": task.deadline,
                }
            )

        inactive_assignments = (
            db.query(TaskAssignment, ProjectMember, User)
            .join(ProjectMember, ProjectMember.user_id == TaskAssignment.user_id)
            .join(User, User.id == TaskAssignment.user_id)
            .filter(
                TaskAssignment.task_id == task.id,
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
                    "task_id": task.id,
                    "task_title": task.title,
                    "task_path": task_path(db, task),
                    "type": "INACTIVE_MEMBER",
                    "reason": f"Membrul {user.name or user.email} este inactiv, dar are assignment activ pe acest task.",
                    "deadline": task.deadline,
                }
            )

    for dep in deps:
        if dep.successor_task_id in parent_ids:
            continue
        if dep.predecessor_task_id not in fully_planned:
            successor = tasks_by_id.get(dep.successor_task_id)
            predecessor = next((task for task in all_tasks if task.id == dep.predecessor_task_id), None)
            problems.append(
                {
                    "task_id": dep.successor_task_id,
                    "task_title": successor.title if successor else None,
                    "task_path": task_path(db, successor) if successor else None,
                    "type": "BLOCKED",
                    "reason": f"Blocat de taskul {predecessor.title if predecessor else f'#{dep.predecessor_task_id}'}.",
                    "deadline": successor.deadline if successor else None,
                }
            )

    problems = [problem for problem in problems if problem.get("deadline") is not None]

    unique = {}
    for problem in problems:
        key = (problem["task_id"], problem["type"], problem["reason"])
        unique[key] = problem

    priority = {
        "MISSED_PLANNED_WORK": 0,
        "DEADLINE_PASSED": 1,
        "INACTIVE_MEMBER": 2,
        "NO_SKILLS": 3,
        "BLOCKED": 4,
        "AT_RISK": 5,
    }
    grouped: dict[int, dict] = {}
    for problem in unique.values():
        task_id = problem["task_id"]
        current = grouped.get(task_id)
        if current is None:
            grouped[task_id] = {
                **problem,
                "types": [problem["type"]],
                "reasons": [problem["reason"]],
            }
            continue

        if problem["type"] not in current["types"]:
            current["types"].append(problem["type"])
        if problem["reason"] not in current["reasons"]:
            current["reasons"].append(problem["reason"])
        if priority.get(problem["type"], 99) < priority.get(current["type"], 99):
            current["type"] = problem["type"]
            current["reason"] = problem["reason"]

    for item in grouped.values():
        item["types"].sort(key=lambda value: priority.get(value, 99))

    return list(grouped.values())
