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
from app.services.notification_service import notify_plan_impact, notify_task_assigned, notify_task_unassigned
from app.services.activity_service import log_project_activity
from app.models.scheduled_block import ScheduledBlock
from app.models.user import User

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
    assigned_user = db.query(User).filter(User.id == payload.user_id).first()
    log_project_activity(
        db,
        task.project_id,
        "TASK_ASSIGNED",
        f"Task asignat: {task.title}",
        actor_id=current_user.id,
        entity_type="TASK",
        entity_id=task.id,
        details=f"Asignat catre {assigned_user.name or assigned_user.email if assigned_user else f'User #{payload.user_id}'}.",
    )
    notify_plan_impact(
        db,
        project_id=task.project_id,
        title="Asignare modificata in plan",
        body=(
            f"Taskul {task.title} a fost asignat catre "
            f"{assigned_user.name or assigned_user.email if assigned_user else f'User #{payload.user_id}'}. "
            "Planificarea va pastra asignarea manuala; ruleaza Replanificare daca vrei sa actualizezi calendarul."
        ),
        actor_id=current_user.id,
        task_id=task.id,
    )

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

    if task.status == "CLOSED":
        raise HTTPException(status_code=400, detail="Taskul este inchis si statusul assignmentului nu mai poate fi modificat")

    row = get_assignment(db, task_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Member can update only their own status (MVP)
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="You can only update your own assignment status")

    if payload.member_status not in ALLOWED_MEMBER_STATUS:
        raise HTTPException(status_code=400, detail="Invalid member_status")

    old_status = row.member_status
    row.member_status = payload.member_status
    db.add(row)
    db.commit()
    db.refresh(row)

    task = get_task(db, task_id)
    if task:
        log_project_activity(
            db,
            task.project_id,
            "ASSIGNMENT_STATUS_CHANGED",
            f"Status assignment modificat: {task.title}",
            actor_id=current_user.id,
            entity_type="TASK",
            entity_id=task.id,
            details=f"Status personal: {old_status} -> {row.member_status}.",
        )
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
    assigned_user = db.query(User).filter(User.id == user_id).first()

    db.query(ScheduledBlock).filter(
        ScheduledBlock.task_id == task_id,
        ScheduledBlock.user_id == user_id,
    ).delete()
    db.commit()

    delete_assignment(db, row)
    notify_task_unassigned(db, task, user_id)

    # Recompute task status after removal
    task = get_task(db, task_id)
    if task:
        recompute_task_status(db, task)
        log_project_activity(
            db,
            task.project_id,
            "TASK_UNASSIGNED",
            f"Asignare eliminata: {task.title}",
            actor_id=current_user.id,
            entity_type="TASK",
            entity_id=task.id,
            details=f"Eliminata asignarea pentru {assigned_user.name or assigned_user.email if assigned_user else f'User #{user_id}'}.",
        )
        notify_plan_impact(
            db,
            project_id=task.project_id,
            title="Asignare eliminata din plan",
            body=(
                f"A fost eliminata asignarea pentru {assigned_user.name or assigned_user.email if assigned_user else f'User #{user_id}'} "
                f"din taskul {task.title}. Ruleaza Replanificare daca taskul trebuie realocat."
            ),
            actor_id=current_user.id,
            task_id=task.id,
        )

    return None
