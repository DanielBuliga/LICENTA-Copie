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