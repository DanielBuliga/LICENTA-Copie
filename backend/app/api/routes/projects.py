from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.auth_deps import get_current_user

from app.schemas.project import ProjectCreate, ProjectPublic, ProjectListItem, ProjectMemberPublic, ProjectUpdate
from app.schemas.member import MemberAddRequest, MemberRoleUpdate, MemberStatusUpdate, ProjectMemberOut, MemberRemoveResponse

from app.services.users_service import get_user_by_email
from app.services.projects_service import (
    create_project,
    add_member,
    get_project_by_id,
    list_projects_for_user,
    list_members,
    get_member_role,
    is_member,
    get_project_member,
    count_owners,
    deactivate_member,
    exists_project_with_title_for_owner,
    exists_project_with_title_for_owner_excluding
)
from app.services.project_delete_service import delete_project_cascade
from app.models.user import User
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.scheduled_block import ScheduledBlock
from app.models.project_document import ProjectDocument
from app.models.project_message import ProjectMessage
from app.services.notification_service import notify_member_added, notify_member_inactive_replan_needed
from app.utils.time_utils import utc_naive
from app.services.activity_service import log_project_activity

router = APIRouter(prefix="/projects", tags=["projects"])

ALLOWED_ROLES = {"OWNER", "ADMIN", "MEMBER"}
ALLOWED_MEMBER_STATUSES = {"ACTIVE", "INACTIVE"}


def require_owner(db: Session, project_id: int, user_id: int):
    role = get_member_role(db, project_id, user_id)
    if role != "OWNER":
        raise HTTPException(status_code=403, detail="Only OWNER can manage project")


def _member_has_project_history(db: Session, project_id: int, user_id: int) -> bool:
    task_ids = [tid for (tid,) in db.query(Task.id).filter(Task.project_id == project_id).all()]
    has_created_tasks = db.query(Task.id).filter(Task.project_id == project_id, Task.created_by == user_id).first() is not None
    has_messages = db.query(ProjectMessage.id).filter(ProjectMessage.project_id == project_id, ProjectMessage.sender_id == user_id).first() is not None
    has_documents = db.query(ProjectDocument.id).filter(ProjectDocument.project_id == project_id, ProjectDocument.uploaded_by == user_id).first() is not None
    has_blocks = db.query(ScheduledBlock.id).filter(ScheduledBlock.project_id == project_id, ScheduledBlock.user_id == user_id).first() is not None
    has_assignments = False
    if task_ids:
        has_assignments = (
            db.query(TaskAssignment.id)
            .filter(TaskAssignment.user_id == user_id, TaskAssignment.task_id.in_(task_ids))
            .first()
            is not None
        )
    return has_created_tasks or has_messages or has_documents or has_blocks or has_assignments


def _delete_future_member_blocks(db: Session, project_id: int, user_id: int) -> None:
    now = utc_naive(datetime.now(timezone.utc))
    db.query(ScheduledBlock).filter(
        ScheduledBlock.project_id == project_id,
        ScheduledBlock.user_id == user_id,
        ScheduledBlock.end_datetime >= now,
    ).delete(synchronize_session=False)


@router.post("", response_model=ProjectPublic, status_code=201)
def create_new_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Prevent duplicate project title for same owner
    if exists_project_with_title_for_owner(db, current_user.id, payload.title):
        raise HTTPException(status_code=400, detail="You already have a project with this title")

    project = create_project(db, payload.title, payload.description, current_user.id)
    add_member(db, project.id, current_user.id, role="OWNER")
    log_project_activity(
        db,
        project.id,
        "PROJECT_CREATED",
        f"Proiect creat: {project.title}",
        actor_id=current_user.id,
        entity_type="PROJECT",
        entity_id=project.id,
        details=f"Proiectul {project.title} a fost creat.",
    )
    return project


@router.get("", response_model=list[ProjectListItem])
def my_projects(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = list_projects_for_user(db, current_user.id)

    result: list[ProjectListItem] = []
    for project, member in rows:
        result.append(
            ProjectListItem(
                id=project.id,
                title=project.title,
                description=project.description,
                role=member.role,
                member_status=member.status,
                created_at=project.created_at,
            )
        )
    return result


@router.get("/{project_id}", response_model=ProjectPublic)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    project = get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return project


@router.get("/{project_id}/members", response_model=list[ProjectMemberPublic])
def project_members(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    members = list_members(db, project_id)
    user_ids = [member.user_id for member in members]
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    users_by_id = {user.id: user for user in users}

    return [
        ProjectMemberPublic(
            user_id=member.user_id,
            name=users_by_id.get(member.user_id).name if users_by_id.get(member.user_id) else None,
            email=users_by_id.get(member.user_id).email if users_by_id.get(member.user_id) else None,
            role=member.role,
            status=member.status,
            joined_at=member.joined_at,
            inactive_at=member.inactive_at,
            inactive_reason=member.inactive_reason,
        )
        for member in members
    ]


@router.post("/{project_id}/members", response_model=ProjectMemberOut, status_code=201)
def add_project_member(
    project_id: int,
    payload: MemberAddRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_owner(db, project_id, current_user.id)

    user = get_user_by_email(db, payload.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if getattr(user, "status", "ACTIVE") != "ACTIVE":
        raise HTTPException(status_code=400, detail="User account is deactivated")

    existing = get_project_member(db, project_id, user.id, active_only=False)
    if existing and existing.status == "ACTIVE":
        raise HTTPException(status_code=400, detail="User is already a project member")

    role = payload.role
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    member = add_member(db, project_id, user.id, role=role)
    project = get_project_by_id(db, project_id)
    if project:
        notify_member_added(db, project, user.id, current_user.name or current_user.email)
        log_project_activity(
            db,
            project_id,
            "MEMBER_ADDED",
            f"Membru adaugat: {user.name or user.email}",
            actor_id=current_user.id,
            entity_type="MEMBER",
            entity_id=user.id,
            details=f"Rol initial: {role}.",
        )
    return member


@router.patch("/{project_id}/members/{user_id}", response_model=ProjectMemberOut)
def change_member_role(
    project_id: int,
    user_id: int,
    payload: MemberRoleUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_owner(db, project_id, current_user.id)

    member = get_project_member(db, project_id, user_id, active_only=False)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.status != "ACTIVE":
        raise HTTPException(status_code=400, detail="Inactive members cannot change role")

    new_role = payload.role
    if new_role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    project = get_project_by_id(db, project_id)
    if project and project.created_by == user_id and new_role != member.role:
        raise HTTPException(status_code=400, detail="Project creator role cannot be changed")

    if member.role == "OWNER" and new_role != "OWNER":
        if count_owners(db, project_id) <= 1:
            raise HTTPException(status_code=400, detail="Project must have at least one OWNER")

    old_role = member.role
    member.role = new_role
    db.add(member)
    db.commit()
    db.refresh(member)
    user = db.query(User).filter(User.id == user_id).first()
    log_project_activity(
        db,
        project_id,
        "MEMBER_ROLE_CHANGED",
        f"Rol modificat: {user.name or user.email if user else f'User #{user_id}'}",
        actor_id=current_user.id,
        entity_type="MEMBER",
        entity_id=user_id,
        details=f"Rol schimbat din {old_role} in {new_role}.",
    )
    return member


@router.patch("/{project_id}/members/{user_id}/status", response_model=ProjectMemberOut)
def change_member_status(
    project_id: int,
    user_id: int,
    payload: MemberStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_owner(db, project_id, current_user.id)

    member = get_project_member(db, project_id, user_id, active_only=False)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    new_status = payload.status.upper()
    if new_status not in ALLOWED_MEMBER_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid member status")

    if member.role == "OWNER" and new_status != "ACTIVE":
        if count_owners(db, project_id) <= 1:
            raise HTTPException(status_code=400, detail="Project must have at least one active OWNER")

    if new_status == "ACTIVE":
        user = db.query(User).filter(User.id == user_id).first()
        if user and getattr(user, "status", "ACTIVE") != "ACTIVE":
            raise HTTPException(status_code=400, detail="User account is deactivated")
        member.status = "ACTIVE"
        member.inactive_at = None
        member.inactive_reason = None
        db.add(member)
        db.commit()
        db.refresh(member)
        log_project_activity(
            db,
            project_id,
            "MEMBER_STATUS_CHANGED",
            f"Membru reactivat: {user.name or user.email if user else f'User #{user_id}'}",
            actor_id=current_user.id,
            entity_type="MEMBER",
            entity_id=user_id,
            details="Status schimbat in ACTIVE.",
        )
        return member

    _delete_future_member_blocks(db, project_id, user_id)
    member = deactivate_member(db, member, payload.reason or "Marcat inactiv manual")
    user = db.query(User).filter(User.id == user_id).first()
    log_project_activity(
        db,
        project_id,
        "MEMBER_STATUS_CHANGED",
        f"Membru inactiv: {user.name or user.email if user else f'User #{user_id}'}",
        actor_id=current_user.id,
        entity_type="MEMBER",
        entity_id=user_id,
        details=payload.reason or "Status schimbat in INACTIVE.",
    )
    notify_member_inactive_replan_needed(db, project_id, user_id)
    return member


@router.delete("/{project_id}/members/{user_id}", response_model=MemberRemoveResponse)
def remove_project_member(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_owner(db, project_id, current_user.id)

    member = get_project_member(db, project_id, user_id, active_only=False)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.role == "OWNER" and member.status == "ACTIVE":
        if count_owners(db, project_id) <= 1:
            raise HTTPException(status_code=400, detail="Project must have at least one active OWNER")

    has_history = _member_has_project_history(db, project_id, user_id)
    if has_history:
        _delete_future_member_blocks(db, project_id, user_id)
        deactivate_member(db, member, "Membru eliminat din proiect, istoric pastrat")
        user = db.query(User).filter(User.id == user_id).first()
        log_project_activity(
            db,
            project_id,
            "MEMBER_STATUS_CHANGED",
            f"Membru inactiv: {user.name or user.email if user else f'User #{user_id}'}",
            actor_id=current_user.id,
            entity_type="MEMBER",
            entity_id=user_id,
            details="Eliminare ceruta, dar membrul avea istoric si a fost pastrat ca INACTIVE.",
        )
        notify_member_inactive_replan_needed(db, project_id, user_id)
        return MemberRemoveResponse(
            action="deactivated",
            status="INACTIVE",
            message="Membrul are activitate in proiect si a fost marcat ca inactiv pentru pastrarea istoricului.",
        )

    db.delete(member)
    db.commit()
    user = db.query(User).filter(User.id == user_id).first()
    log_project_activity(
        db,
        project_id,
        "MEMBER_REMOVED",
        f"Membru eliminat definitiv: {user.name or user.email if user else f'User #{user_id}'}",
        actor_id=current_user.id,
        entity_type="MEMBER",
        entity_id=user_id,
        details="Membrul nu avea activitate in proiect.",
    )
    return MemberRemoveResponse(
        action="deleted",
        status=None,
        message="Membrul nu avea activitate in proiect si a fost eliminat definitiv.",
    )


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    require_owner(db, project_id, current_user.id)

    delete_project_cascade(db, project_id)
    return None


@router.patch("/{project_id}", response_model=ProjectPublic)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    require_owner(db, project_id, current_user.id)

    # Update title (with uniqueness check per owner)
    if payload.title is not None:
        if exists_project_with_title_for_owner_excluding(db, project.created_by, payload.title, project_id):
            raise HTTPException(status_code=400, detail="You already have a project with this title")
        project.title = payload.title

    # Update description (can be None)
    if payload.description is not None:
        project.description = payload.description

    db.add(project)
    db.commit()
    db.refresh(project)
    return project
