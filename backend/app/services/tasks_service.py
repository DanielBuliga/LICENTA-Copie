from datetime import datetime

from sqlalchemy.orm import Session

from app.models.task import Task


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


def list_tasks(db: Session, project_id: int) -> list[Task]:
    return db.query(Task).filter(Task.project_id == project_id).order_by(Task.deadline.asc()).all()


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
