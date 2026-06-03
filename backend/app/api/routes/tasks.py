from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.auth_deps import get_current_user
from app.core.permissions import require_roles

from app.services.projects_service import is_member, get_project_by_id
from app.schemas.task import TaskCreate, TaskUpdate, TaskPublic, MyTaskPublic
from app.services.tasks_service import create_task, get_task, list_tasks, update_task, delete_task, would_create_parent_cycle
from app.services.projects_service import get_member_role
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.project import Project
from app.services.notification_service import notify_project_completed_if_needed

from app.utils.time_utils import utc_naive

router = APIRouter(tags=["tasks"])


@router.get("/users/me/tasks", response_model=list[MyTaskPublic])
def get_my_assigned_tasks(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = (
        db.query(Task, TaskAssignment, Project)
        .join(TaskAssignment, TaskAssignment.task_id == Task.id)
        .join(Project, Project.id == Task.project_id)
        .filter(TaskAssignment.user_id == current_user.id)
        .order_by(Task.deadline.asc())
        .all()
    )

    return [
        MyTaskPublic(
            id=task.id,
            project_id=task.project_id,
            title=task.title,
            description=task.description,
            parent_task_id=task.parent_task_id,
            priority=task.priority,
            estimate_minutes=task.estimate_minutes,
            deadline=task.deadline,
            status=task.status,
            created_by=task.created_by,
            created_at=task.created_at,
            updated_at=task.updated_at,
            project_title=project.title,
            member_status=assignment.member_status,
            assigned_minutes=assignment.assigned_minutes,
        )
        for task, assignment, project in rows
    ]


@router.post("/projects/{project_id}/tasks", response_model=TaskPublic, status_code=201)
def create_task_in_project(
    project_id: int,
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    project = get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # If parent_task_id is set, make sure it exists and belongs to same project
    if payload.parent_task_id is not None:
        parent = get_task(db, payload.parent_task_id)
        if not parent or parent.project_id != project_id:
            raise HTTPException(status_code=400, detail="Invalid parent_task_id")

    task = create_task(
        db=db,
        project_id=project_id,
        title=payload.title,
        description=payload.description,
        parent_task_id=payload.parent_task_id,
        priority=payload.priority,
        estimate_minutes=payload.estimate_minutes,
        deadline=utc_naive(payload.deadline),
        created_by=current_user.id,
    )
    return task


@router.get("/projects/{project_id}/tasks", response_model=list[TaskPublic])
def get_tasks_for_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    return list_tasks(db, project_id)


@router.get("/tasks/{task_id}", response_model=TaskPublic)
def get_task_by_id(
    task_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not is_member(db, task.project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    return task


@router.patch("/tasks/{task_id}", response_model=TaskPublic)
def update_task_by_id(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not is_member(db, task.project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    require_roles(db, task.project_id, current_user.id, {"OWNER", "ADMIN"})

    if task.status == "CLOSED":
        raise HTTPException(status_code=400, detail="Closed task cannot be edited")
    
    # Apply changes (only if provided)
    if payload.title is not None:
        task.title = payload.title
    if payload.description is not None:
        task.description = payload.description
    if payload.priority is not None:
        task.priority = payload.priority
    if payload.estimate_minutes is not None:
        task.estimate_minutes = payload.estimate_minutes
    if payload.deadline is not None:
        task.deadline = utc_naive(payload.deadline)
    if payload.status is not None:
        task.status = payload.status

    if "parent_task_id" in payload.model_fields_set:
        if payload.parent_task_id is None:
            task.parent_task_id = None
        else:
            if payload.parent_task_id == task.id:
                raise HTTPException(status_code=400, detail="Task cannot be its own parent")

            parent = get_task(db, payload.parent_task_id)
            if not parent or parent.project_id != task.project_id:
                raise HTTPException(status_code=400, detail="Invalid parent_task_id")

            if would_create_parent_cycle(db, task.id, payload.parent_task_id):
                raise HTTPException(status_code=400, detail="Parent change would create a cycle")

            task.parent_task_id = payload.parent_task_id

    return update_task(db, task)


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task_by_id(
    task_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not is_member(db, task.project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    delete_task(db, task)
    return None


@router.post("/tasks/{task_id}/close")
def close_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Only OWNER can close tasks
    role = get_member_role(db, task.project_id, current_user.id)
    if role != "OWNER":
        raise HTTPException(status_code=403, detail="Only OWNER can close tasks")

    if task.status != "READY_TO_CLOSE":
        raise HTTPException(status_code=409, detail="Task is not ready to close")

    task.status = "CLOSED"
    db.add(task)
    db.commit()
    db.refresh(task)
    notify_project_completed_if_needed(db, task.project_id)

    return {"task_id": task.id, "status": task.status}
