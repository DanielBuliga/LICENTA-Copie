from sqlalchemy.orm import Session

from app.models.task import Task
from app.services.assignments_service import list_assignments
from app.services.activity_service import log_project_activity
from app.services.notification_service import notify_ready_to_close
from app.services.tasks_service import recompute_parent_status_chain


def recompute_task_status(db: Session, task: Task) -> Task:
    """
    Simple rule:
    - if task has no assignments -> keep current status (do nothing)
    - if all assignments are DONE -> READY_TO_CLOSE
    - else -> IN_PROGRESS (unless already CLOSED)
    """
    if task.status == "CLOSED":
        return task

    assignments = list_assignments(db, task.id)
    if not assignments:
        return task

    previous_status = task.status
    all_done = all(a.member_status == "DONE" for a in assignments)
    if all_done:
        task.status = "READY_TO_CLOSE"
    else:
        # If at least one member is working, treat as in progress
        task.status = "IN_PROGRESS"

    db.add(task)
    db.commit()
    db.refresh(task)
    if previous_status != "READY_TO_CLOSE" and task.status == "READY_TO_CLOSE":
        notify_ready_to_close(db, task)
        log_project_activity(
            db,
            task.project_id,
            "TASK_READY_TO_CLOSE",
            f"Task gata de verificare: {task.title}",
            actor_id=None,
            entity_type="TASK",
            entity_id=task.id,
            details="Toate assignment-urile taskului sunt finalizate.",
        )
    recompute_parent_status_chain(db, task)
    return task
