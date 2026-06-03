from sqlalchemy.orm import Session

from app.models.task_dependency import TaskDependency


def list_dependencies(db: Session, project_id: int) -> list[TaskDependency]:
    return db.query(TaskDependency).filter(TaskDependency.project_id == project_id).all()


def create_dependency(
    db: Session,
    project_id: int,
    predecessor_task_id: int,
    successor_task_id: int,
) -> TaskDependency:
    dep = TaskDependency(
        project_id=project_id,
        predecessor_task_id=predecessor_task_id,
        successor_task_id=successor_task_id,
    )
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return dep


def delete_dependency(db: Session, project_id: int, predecessor_task_id: int, successor_task_id: int) -> None:
    dep = (
        db.query(TaskDependency)
        .filter(
            TaskDependency.project_id == project_id,
            TaskDependency.predecessor_task_id == predecessor_task_id,
            TaskDependency.successor_task_id == successor_task_id,
        )
        .first()
    )
    if dep:
        db.delete(dep)
        db.commit()