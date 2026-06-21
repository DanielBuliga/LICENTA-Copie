from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.auth_deps import get_current_user
from app.core.permissions import require_roles
from app.schemas.dependency import DependencyCreate, DependencyPublic
from app.services.projects_service import is_member
from app.services.tasks_service import get_task
from app.services.dependencies_service import list_dependencies, create_dependency, delete_dependency
from app.services.activity_service import log_project_activity
from app.services.notification_service import notify_plan_impact
from app.utils.graph import would_create_cycle

router = APIRouter(prefix="/projects/{project_id}/dependencies", tags=["dependencies"])


@router.get("", response_model=list[DependencyPublic])
def get_deps(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    return list_dependencies(db, project_id)


@router.post("", response_model=DependencyPublic, status_code=201)
def add_dep(
    project_id: int,
    payload: DependencyCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    require_roles(db, project_id, current_user.id, {"OWNER", "ADMIN"})

    if payload.predecessor_task_id == payload.successor_task_id:
        raise HTTPException(status_code=400, detail="Invalid dependency (same task)")

    pred = get_task(db, payload.predecessor_task_id)
    succ = get_task(db, payload.successor_task_id)
    if not pred or not succ:
        raise HTTPException(status_code=404, detail="Task not found")

    if pred.project_id != project_id or succ.project_id != project_id:
        raise HTTPException(status_code=400, detail="Tasks must be in same project")

    # Load all edges in this project
    existing = list_dependencies(db, project_id)
    edges = [(d.predecessor_task_id, d.successor_task_id) for d in existing]

    # Do not allow duplicates
    if (payload.predecessor_task_id, payload.successor_task_id) in edges:
        raise HTTPException(status_code=400, detail="Dependency already exists")

    if would_create_cycle(edges, (payload.predecessor_task_id, payload.successor_task_id)):
        raise HTTPException(status_code=400, detail="Dependency would create a cycle")

    dependency = create_dependency(
        db,
        project_id=project_id,
        predecessor_task_id=payload.predecessor_task_id,
        successor_task_id=payload.successor_task_id,
    )
    log_project_activity(
        db,
        project_id,
        "TASK_DEPENDENCY_ADDED",
        f"Dependenta adaugata: {pred.title} -> {succ.title}",
        actor_id=current_user.id,
        entity_type="TASK_DEPENDENCY",
        entity_id=dependency.id,
    )
    notify_plan_impact(
        db,
        project_id=project_id,
        title="Relatie de precedenta modificata",
        body=(
            f"A fost adaugata dependenta {pred.title} -> {succ.title}. "
            "Ordinea de planificare se poate schimba; ruleaza Replanificare daca exista deja un plan generat."
        ),
        actor_id=current_user.id,
        task_id=succ.id,
    )
    return dependency


@router.delete("", status_code=204)
def remove_dep(
    project_id: int,
    payload: DependencyCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    require_roles(db, project_id, current_user.id, {"OWNER", "ADMIN"})

    pred = get_task(db, payload.predecessor_task_id)
    succ = get_task(db, payload.successor_task_id)
    delete_dependency(db, project_id, payload.predecessor_task_id, payload.successor_task_id)
    log_project_activity(
        db,
        project_id,
        "TASK_DEPENDENCY_REMOVED",
        f"Dependenta eliminata: {pred.title if pred else payload.predecessor_task_id} -> {succ.title if succ else payload.successor_task_id}",
        actor_id=current_user.id,
        entity_type="TASK_DEPENDENCY",
    )
    notify_plan_impact(
        db,
        project_id=project_id,
        title="Relatie de precedenta eliminata",
        body=(
            f"A fost eliminata dependenta {pred.title if pred else payload.predecessor_task_id} -> "
            f"{succ.title if succ else payload.successor_task_id}. "
            "Planul existent poate permite o alta ordine; ruleaza Replanificare daca este necesar."
        ),
        actor_id=current_user.id,
        task_id=succ.id if succ else None,
    )
    return None
