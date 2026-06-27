from sqlalchemy.orm import Session

from app.models.task_assignment import TaskAssignment


def list_assignments(db: Session, task_id: int) -> list[TaskAssignment]:
    return db.query(TaskAssignment).filter(TaskAssignment.task_id == task_id).all()


def get_assignment(db: Session, task_id: int, user_id: int) -> TaskAssignment | None:
    return (
        db.query(TaskAssignment)
        .filter(TaskAssignment.task_id == task_id, TaskAssignment.user_id == user_id)
        .first()
    )


def create_assignment(
    db: Session,
    task_id: int,
    user_id: int,
    assigned_minutes: int | None,
    assignment_source: str = "MANUAL",
) -> TaskAssignment:
    row = TaskAssignment(
        task_id=task_id,
        user_id=user_id,
        assigned_minutes=assigned_minutes,
        assignment_source=assignment_source,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_assignment(db: Session, assignment: TaskAssignment) -> None:
    db.delete(assignment)
    db.commit()


def list_assigned_user_ids(db: Session, task_id: int) -> list[int]:
    rows = db.query(TaskAssignment).filter(TaskAssignment.task_id == task_id).all()
    return [r.user_id for r in rows]
