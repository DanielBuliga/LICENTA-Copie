from datetime import datetime

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.project_document import ProjectDocument
from app.models.scheduled_block import ScheduledBlock
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.task_dependency import TaskDependency
from app.models.task_skill_requirement import TaskSkillRequirement


def normalize_task_title(title: str) -> str:
    return " ".join(title.strip().lower().split())


def duplicate_task_title_exists(
    db: Session,
    project_id: int,
    title: str,
    parent_task_id: int | None,
    exclude_task_id: int | None = None,
) -> bool:
    normalized_title = normalize_task_title(title)
    with db.no_autoflush:
        query = db.query(Task).filter(Task.project_id == project_id)
        if parent_task_id is None:
            query = query.filter(Task.parent_task_id.is_(None))
        else:
            query = query.filter(Task.parent_task_id == parent_task_id)
        if exclude_task_id is not None:
            query = query.filter(Task.id != exclude_task_id)

        return any(normalize_task_title(task.title) == normalized_title for task in query.all())


def create_task(
    db: Session,
    project_id: int,
    title: str,
    description: str | None,
    parent_task_id: int | None,
    priority: int,
    estimate_minutes: int,
    deadline,
    created_by: int,
) -> Task:
    task = Task(
        project_id=project_id,
        title=title,
        description=description,
        parent_task_id=parent_task_id,
        priority=priority,
        estimate_minutes=estimate_minutes,
        deadline=deadline,
        created_by=created_by,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def get_task(db: Session, task_id: int) -> Task | None:
    return db.query(Task).filter(Task.id == task_id).first()


def list_tasks(db: Session, project_id: int, offset: int = 0, limit: int | None = None) -> list[Task]:
    query = db.query(Task).filter(Task.project_id == project_id).order_by(Task.deadline.asc())
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    return query.all()


def list_subtasks(db: Session, task_id: int) -> list[Task]:
    return db.query(Task).filter(Task.parent_task_id == task_id).order_by(Task.deadline.asc()).all()


def has_subtasks(db: Session, task_id: int) -> bool:
    return db.query(Task.id).filter(Task.parent_task_id == task_id).first() is not None


def leaf_tasks(db: Session, project_id: int) -> list[Task]:
    tasks = list_tasks(db, project_id)
    parent_ids = {task.parent_task_id for task in tasks if task.parent_task_id is not None}
    return [task for task in tasks if task.id not in parent_ids]


def task_path(db: Session, task: Task) -> str:
    parts = [task.title]
    current = task.parent_task_id
    seen = {task.id}

    while current is not None and current not in seen:
        seen.add(current)
        parent = get_task(db, current)
        if not parent:
            break
        parts.append(parent.title)
        current = parent.parent_task_id

    return " / ".join(reversed(parts))


def aggregate_estimate_minutes(db: Session, task_id: int) -> int:
    children = list_subtasks(db, task_id)
    if not children:
        task = get_task(db, task_id)
        return task.estimate_minutes if task else 0
    return sum(aggregate_estimate_minutes(db, child.id) for child in children)


def aggregate_deadline(db: Session, task_id: int) -> datetime | None:
    children = list_subtasks(db, task_id)
    if not children:
        task = get_task(db, task_id)
        return task.deadline if task else None

    child_deadlines = [deadline for child in children if (deadline := aggregate_deadline(db, child.id)) is not None]
    return max(child_deadlines) if child_deadlines else None


def direct_subtasks_closed(db: Session, task_id: int) -> bool:
    children = list_subtasks(db, task_id)
    return bool(children) and all(child.status == "CLOSED" for child in children)


def recompute_container_status(db: Session, task_id: int) -> Task | None:
    task = get_task(db, task_id)
    if not task or task.status == "CLOSED":
        return task

    children = list_subtasks(db, task.id)
    if not children:
        return task

    if all(child.status == "CLOSED" for child in children):
        task.status = "READY_TO_CLOSE"
    elif any(child.status in {"IN_PROGRESS", "READY_TO_CLOSE", "CLOSED"} for child in children):
        task.status = "IN_PROGRESS"
    else:
        task.status = "OPEN"

    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def recompute_parent_status_chain(db: Session, task: Task) -> None:
    current_id = task.parent_task_id
    seen: set[int] = set()

    while current_id is not None and current_id not in seen:
        seen.add(current_id)
        parent = recompute_container_status(db, current_id)
        if not parent:
            break
        current_id = parent.parent_task_id


def update_task(db: Session, task: Task) -> Task:
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, task: Task) -> None:
    db.query(ScheduledBlock).filter(ScheduledBlock.task_id == task.id).delete(synchronize_session=False)
    db.query(TaskAssignment).filter(TaskAssignment.task_id == task.id).delete(synchronize_session=False)
    db.query(TaskSkillRequirement).filter(TaskSkillRequirement.task_id == task.id).delete(synchronize_session=False)
    db.query(TaskDependency).filter(
        (TaskDependency.predecessor_task_id == task.id) | (TaskDependency.successor_task_id == task.id)
    ).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.task_id == task.id).update(
        {Notification.task_id: None},
        synchronize_session=False,
    )
    db.query(ProjectDocument).filter(ProjectDocument.task_id == task.id).update(
        {ProjectDocument.task_id: None},
        synchronize_session=False,
    )
    db.delete(task)
    db.commit()


def would_create_parent_cycle(db: Session, task_id: int, new_parent_id: int) -> bool:
    current = new_parent_id

    while current is not None:
        if current == task_id:
            return True

        parent = db.query(Task).filter(Task.id == current).first()
        if not parent:
            break

        current = parent.parent_task_id

    return False
