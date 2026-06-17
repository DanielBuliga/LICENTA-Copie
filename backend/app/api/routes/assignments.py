from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.auth_deps import get_current_user
from app.core.permissions import require_roles
from app.schemas.assignment import AssignmentCreate, AssignmentUpdate, AssignmentPublic
from app.services.projects_service import is_member
from app.services.tasks_service import get_task, has_subtasks
from app.services.assignments_service import (
    list_assignments,
    get_assignment,
    create_assignment,
    delete_assignment,
)
from app.services.task_status_service import recompute_task_status
from app.services.notification_service import notify_task_assigned
from app.models.scheduled_block import ScheduledBlock

router = APIRouter(prefix="/tasks", tags=["assignments"])

ALLOWED_MEMBER_STATUS = {"TODO", "IN_PROGRESS", "DONE"}


@router.get("/{task_id}/assignments", response_model=list[AssignmentPublic])
def get_task_assignments(
    task_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Only project members can see assignments
    if not is_member(db, task.project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    return list_assignments(db, task_id)


@router.post("/{task_id}/assignments", response_model=AssignmentPublic, status_code=201)
def add_assignment(
    task_id: int,
    payload: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Only project members can assign
    if not is_member(db, task.project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    # Only OWNER/ADMIN can add assignments
    require_roles(db, task.project_id, current_user.id, {"OWNER", "ADMIN"})

    if has_subtasks(db, task.id):
        raise HTTPException(status_code=400, detail="Taskurile cu subtaskuri sunt containere si nu se asigneaza direct")

    # You can only assign users who are members of the same project
    if not is_member(db, task.project_id, payload.user_id):
        raise HTTPException(status_code=400, detail="User is not a member of this project")
    
    existing = get_assignment(db, task_id, payload.user_id)
    if existing:
        raise HTTPException(status_code=400, detail="User already assigned to task")

    row = create_assignment(db, task_id, payload.user_id, payload.assigned_minutes)
    notify_task_assigned(db, task, payload.user_id)

    # Recompute task status after new assignment 
    task = get_task(db, task_id)
    if task:
        recompute_task_status(db, task)

    return row


@router.patch("/{task_id}/assignments/{user_id}", response_model=AssignmentPublic)
def update_assignment_status(
    task_id: int,
    user_id: int,
    payload: AssignmentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not is_member(db, task.project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    row = get_assignment(db, task_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Member can update only their own status (MVP)
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="You can only update your own assignment status")

    if payload.member_status not in ALLOWED_MEMBER_STATUS:
        raise HTTPException(status_code=400, detail="Invalid member_status")

    row.member_status = payload.member_status
    db.add(row)
    db.commit()
    db.refresh(row)

    # Recompute task status after status change
    task = get_task(db, task_id)
    if task:
        recompute_task_status(db, task)

    return row


@router.delete("/{task_id}/assignments/{user_id}", status_code=204)
def remove_assignment(
    task_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Only OWNER/ADMIN can remove assignments
    require_roles(db, task.project_id, current_user.id, {"OWNER", "ADMIN"})

    # Only project members can remove assignments (MVP)
    if not is_member(db, task.project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    row = get_assignment(db, task_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    db.query(ScheduledBlock).filter(
        ScheduledBlock.task_id == task_id,
        ScheduledBlock.user_id == user_id,
    ).delete()
    db.commit()

    delete_assignment(db, row)

    # Recompute task status after removal
    task = get_task(db, task_id)
    if task:
        recompute_task_status(db, task)

    return None
