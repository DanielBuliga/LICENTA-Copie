from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.models.project import Project
from app.models.project_member import ProjectMember


def create_project(db: Session, title: str, description: str | None, created_by: int) -> Project:
    project = Project(title=title, description=description, created_by=created_by)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def add_member(db: Session, project_id: int, user_id: int, role: str) -> ProjectMember:
    existing = get_project_member(db, project_id, user_id, active_only=False)
    if existing:
        existing.role = role
        existing.status = "ACTIVE"
        existing.inactive_at = None
        existing.inactive_reason = None
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    member = ProjectMember(project_id=project_id, user_id=user_id, role=role, status="ACTIVE")
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def get_project_by_id(db: Session, project_id: int) -> Project | None:
    return db.query(Project).filter(Project.id == project_id).first()


def get_project_member(db: Session, project_id: int, user_id: int, active_only: bool = True) -> ProjectMember | None:
    query = db.query(ProjectMember).filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
    if active_only:
        query = query.filter(ProjectMember.status == "ACTIVE")
    return query.first()


def is_member(db: Session, project_id: int, user_id: int) -> bool:
    return get_project_member(db, project_id, user_id) is not None


def get_member_role(db: Session, project_id: int, user_id: int) -> str | None:
    m = get_project_member(db, project_id, user_id)
    return m.role if m else None


def list_members(db: Session, project_id: int, active_only: bool = False) -> list[ProjectMember]:
    query = db.query(ProjectMember).filter(ProjectMember.project_id == project_id)
    if active_only:
        query = query.filter(ProjectMember.status == "ACTIVE")
    return query.all()


def count_owners(db: Session, project_id: int) -> int:
    return (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.role == "OWNER", ProjectMember.status == "ACTIVE")
        .count()
    )


def list_projects_for_user(db: Session, user_id: int) -> list[tuple[Project, ProjectMember]]:
    """
    Return list of pairs (Project, ProjectMember) so we can expose the user's role in that project.
    """
    rows = (
        db.query(Project, ProjectMember)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(ProjectMember.user_id == user_id, ProjectMember.status == "ACTIVE")
        .all()
    )
    return rows


def deactivate_member(db: Session, member: ProjectMember, reason: str | None = None) -> ProjectMember:
    member.status = "INACTIVE"
    member.inactive_at = datetime.now(timezone.utc)
    member.inactive_reason = reason
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def exists_project_with_title_for_owner(db: Session, created_by: int, title: str) -> bool:
    normalized_title = " ".join(title.strip().lower().split())
    projects = db.query(Project).filter(Project.created_by == created_by).all()
    return any(" ".join(project.title.strip().lower().split()) == normalized_title for project in projects)


def exists_project_with_title_for_owner_excluding(
    db: Session,
    created_by: int,
    title: str,
    exclude_project_id: int,
) -> bool:
    normalized_title = " ".join(title.strip().lower().split())
    projects = (
        db.query(Project)
        .filter(Project.created_by == created_by, Project.id != exclude_project_id)
        .all()
    )
    return any(" ".join(project.title.strip().lower().split()) == normalized_title for project in projects)
