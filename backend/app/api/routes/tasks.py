from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.auth_deps import get_current_user
from app.core.permissions import require_roles

from app.services.projects_service import is_member, get_project_by_id
from app.schemas.task import TaskCreate, TaskUpdate, TaskPublic, MyTaskPublic
from app.services.tasks_service import (
    create_task,
    direct_subtasks_closed,
    duplicate_task_title_exists,
    get_task,
    has_subtasks,
    list_tasks,
    recompute_container_status,
    recompute_parent_status_chain,
    update_task,
    delete_task,
    would_create_parent_cycle,
)
from app.services.projects_service import get_member_role
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.project import Project
from app.models.scheduled_block import ScheduledBlock
from app.services.notification_service import (
    notify_plan_impact,
    notify_project_completed_if_needed,
    notify_task_changed,
    notify_task_deleted,
)
from app.services.activity_service import log_project_activity

from app.utils.time_utils import utc_naive

router = APIRouter(tags=["tasks"])


def _now_utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _clean_title(title: str) -> str:
    cleaned = title.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Titlul taskului este obligatoriu.")
    if len(cleaned) > 200:
        raise HTTPException(status_code=400, detail="Titlul taskului poate avea maximum 200 de caractere.")
    return cleaned


def _validate_future_deadline(deadline: datetime, *, old_deadline: datetime | None = None) -> datetime:
    deadline_naive = utc_naive(deadline)
    if old_deadline is None or deadline_naive != old_deadline:
        if deadline_naive <= _now_utc_naive():
            raise HTTPException(status_code=400, detail="Deadline-ul trebuie să fie în viitor.")
    return deadline_naive


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
    parent_ids = {task.parent_task_id for task, _, _ in rows if task.parent_task_id is not None}
    parents_by_id = {
        parent.id: parent
        for parent in db.query(Task).filter(Task.id.in_(parent_ids)).all()
    } if parent_ids else {}

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
            parent_task_title=parents_by_id.get(task.parent_task_id).title if task.parent_task_id in parents_by_id else None,
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
        if parent.status in {"READY_TO_CLOSE", "CLOSED"}:
            raise HTTPException(status_code=400, detail="Nu poți adăuga subtaskuri la un task finalizat.")

    title = _clean_title(payload.title)
    deadline = _validate_future_deadline(payload.deadline)

    if duplicate_task_title_exists(db, project_id, title, payload.parent_task_id):
        raise HTTPException(status_code=409, detail="Există deja un task cu acest nume în același nivel.")

    task = create_task(
        db=db,
        project_id=project_id,
        title=title,
        description=payload.description,
        parent_task_id=payload.parent_task_id,
        priority=payload.priority,
        estimate_minutes=payload.estimate_minutes,
        deadline=deadline,
        created_by=current_user.id,
    )
    if task.parent_task_id is not None:
        recompute_parent_status_chain(db, task)
    log_project_activity(
        db,
        project_id,
        "TASK_CREATED",
        f"Task creat: {task.title}",
        actor_id=current_user.id,
        entity_type="TASK",
        entity_id=task.id,
        details=f"Estimare: {task.estimate_minutes} min. Deadline: {task.deadline}.",
    )
    notify_plan_impact(
        db,
        project_id=project_id,
        title=f"Planul poate necesita actualizare: {project.title}",
        body=(
            f"A fost creat taskul {task.title}. "
            "Verifica tabul Problems sau ruleaza Replanificare daca taskul trebuie inclus in plan."
        ),
        actor_id=current_user.id,
        task_id=task.id,
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

    old_title = task.title
    old_priority = task.priority
    old_estimate = task.estimate_minutes
    old_deadline = task.deadline
    old_status = task.status
    old_parent_task_id = task.parent_task_id
    old_parent_title = None
    if old_parent_task_id is not None:
        old_parent = get_task(db, old_parent_task_id)
        old_parent_title = old_parent.title if old_parent else f"Task #{old_parent_task_id}"
    
    # Apply changes (only if provided)
    if payload.title is not None:
        task.title = _clean_title(payload.title)
    if payload.description is not None:
        task.description = payload.description
    if payload.priority is not None:
        task.priority = payload.priority
    if payload.estimate_minutes is not None:
        task.estimate_minutes = payload.estimate_minutes
    if payload.deadline is not None:
        task.deadline = _validate_future_deadline(payload.deadline, old_deadline=old_deadline)
    if payload.status is not None:
        if payload.status == "CLOSED" and has_subtasks(db, task.id) and not direct_subtasks_closed(db, task.id):
            raise HTTPException(status_code=409, detail="Taskul are subtaskuri nefinalizate")
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
            if parent.status in {"READY_TO_CLOSE", "CLOSED"}:
                raise HTTPException(status_code=400, detail="Nu poți muta taskul sub un task finalizat.")

            if would_create_parent_cycle(db, task.id, payload.parent_task_id):
                raise HTTPException(status_code=400, detail="Parent change would create a cycle")

            task.parent_task_id = payload.parent_task_id

    if duplicate_task_title_exists(
        db,
        task.project_id,
        task.title,
        task.parent_task_id,
        exclude_task_id=task.id,
    ):
        raise HTTPException(status_code=409, detail="Există deja un task cu acest nume în același nivel.")

    task = update_task(db, task)
    recompute_parent_status_chain(db, task)
    if old_parent_task_id is not None and old_parent_task_id != task.parent_task_id:
        old_parent = recompute_container_status(db, old_parent_task_id)
        if old_parent:
            recompute_parent_status_chain(db, old_parent)
    changes: list[str] = []
    if old_title != task.title:
        changes.append(f"titlu: {old_title} -> {task.title}")
    if old_priority != task.priority:
        changes.append(f"prioritate: {old_priority} -> {task.priority}")
    if old_estimate != task.estimate_minutes:
        changes.append(f"estimare: {old_estimate} min -> {task.estimate_minutes} min")
    if old_deadline != task.deadline:
        changes.append(f"deadline: {old_deadline} -> {task.deadline}")
    if old_status != task.status:
        changes.append(f"status: {old_status} -> {task.status}")
    if old_parent_task_id != task.parent_task_id:
        new_parent_title = None
        if task.parent_task_id is not None:
            new_parent = get_task(db, task.parent_task_id)
            new_parent_title = new_parent.title if new_parent else f"Task #{task.parent_task_id}"
        changes.append(f"parinte: {old_parent_title or 'fara'} -> {new_parent_title or 'fara'}")
    if changes:
        event_type = "TASK_DEADLINE_CHANGED" if old_deadline != task.deadline and len(changes) == 1 else "TASK_UPDATED"
        log_project_activity(
            db,
            task.project_id,
            event_type,
            f"Task modificat: {task.title}",
            actor_id=current_user.id,
            entity_type="TASK",
            entity_id=task.id,
            details="; ".join(changes),
        )
        plan_impact_changes = []
        if old_priority != task.priority:
            plan_impact_changes.append("prioritatea")
        if old_estimate != task.estimate_minutes:
            plan_impact_changes.append("estimarea")
        if old_deadline != task.deadline:
            plan_impact_changes.append("deadline-ul")
        if old_parent_task_id != task.parent_task_id:
            plan_impact_changes.append("taskul parinte")
        if plan_impact_changes:
            project = get_project_by_id(db, task.project_id)
            notify_plan_impact(
                db,
                project_id=task.project_id,
                title=f"Planul poate necesita replanificare: {project.title if project else 'proiect'}",
                body=(
                    f"Taskul {task.title} a fost modificat ({', '.join(plan_impact_changes)}). "
                    "Verifica tabul Problems sau ruleaza Replanificare daca planul curent nu mai este valid."
                ),
                actor_id=current_user.id,
                task_id=task.id,
            )
            assignee_changes = [
                label
                for label in plan_impact_changes
                if label in {"estimarea", "deadline-ul", "prioritatea"}
            ]
            notify_task_changed(db, task, assignee_changes, actor_id=current_user.id)
    return task


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

    require_roles(db, task.project_id, current_user.id, {"OWNER", "ADMIN"})

    if has_subtasks(db, task.id):
        raise HTTPException(status_code=400, detail="Șterge sau mută subtaskurile înainte de a șterge taskul părinte.")

    project_id = task.project_id
    task_title = task.title
    assigned_user_ids = [
        user_id
        for (user_id,) in db.query(TaskAssignment.user_id).filter(TaskAssignment.task_id == task.id).all()
    ]
    delete_task(db, task)
    log_project_activity(
        db,
        project_id,
        "TASK_DELETED",
        f"Task sters: {task_title}",
        actor_id=current_user.id,
        entity_type="TASK",
        entity_id=task_id,
    )
    project = get_project_by_id(db, project_id)
    notify_plan_impact(
        db,
        project_id=project_id,
        title=f"Planul poate necesita actualizare: {project.title if project else 'proiect'}",
        body=(
            f"Taskul {task_title} a fost sters. "
            "Verifica tabul Plan si ruleaza Replanificare daca existau blocuri sau dependente afectate."
        ),
        actor_id=current_user.id,
    )
    notify_task_deleted(
        db,
        project_id=project_id,
        task_id=task_id,
        task_title=task_title,
        user_ids=assigned_user_ids,
        actor_id=current_user.id,
    )
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

    if has_subtasks(db, task.id) and not direct_subtasks_closed(db, task.id):
        raise HTTPException(status_code=409, detail="Taskul are subtaskuri nefinalizate")

    task.status = "CLOSED"
    db.add(task)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db.query(ScheduledBlock).filter(
        ScheduledBlock.task_id == task.id,
        ScheduledBlock.start_datetime >= now,
    ).delete()
    db.commit()
    db.refresh(task)
    recompute_parent_status_chain(db, task)
    notify_project_completed_if_needed(db, task.project_id)
    log_project_activity(
        db,
        task.project_id,
        "TASK_CLOSED",
        f"Task inchis: {task.title}",
        actor_id=current_user.id,
        entity_type="TASK",
        entity_id=task.id,
        details="Ownerul a confirmat finalizarea taskului.",
    )

    return {"task_id": task.id, "status": task.status}
