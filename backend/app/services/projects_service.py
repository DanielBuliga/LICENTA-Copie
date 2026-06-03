from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.project_member import ProjectMember


def create_project(db: Session, title: str, description: str | None, created_by: int) -> Project:
    project = Project(title=title, description=description, created_by=created_by)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def add_member(db: Session, project_id: int, user_id: int, role: str) -> ProjectMember:
    member = ProjectMember(project_id=project_id, user_id=user_id, role=role)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def get_project_by_id(db: Session, project_id: int) -> Project | None:
    return db.query(Project).filter(Project.id == project_id).first()


def get_project_member(db: Session, project_id: int, user_id: int) -> ProjectMember | None:
    return (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )


def is_member(db: Session, project_id: int, user_id: int) -> bool:
    return get_project_member(db, project_id, user_id) is not None


def get_member_role(db: Session, project_id: int, user_id: int) -> str | None:
    m = get_project_member(db, project_id, user_id)
    return m.role if m else None


def list_members(db: Session, project_id: int) -> list[ProjectMember]:
    return db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()


def count_owners(db: Session, project_id: int) -> int:
    return (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.role == "OWNER")
        .count()
    )


def list_projects_for_user(db: Session, user_id: int) -> list[tuple[Project, ProjectMember]]:
    """
    Return list of pairs (Project, ProjectMember) so we can expose the user's role in that project.
    """
    rows = (
        db.query(Project, ProjectMember)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(ProjectMember.user_id == user_id)
        .all()
    )
    return rows


def exists_project_with_title_for_owner(db: Session, created_by: int, title: str) -> bool:
    return (
        db.query(Project)
        .filter(Project.created_by == created_by, Project.title == title)
        .first()
        is not None
    )


def exists_project_with_title_for_owner_excluding(
    db: Session,
    created_by: int,
    title: str,
    exclude_project_id: int,
) -> bool:
    return (
        db.query(Project)
        .filter(
            Project.created_by == created_by,
            Project.title == title,
            Project.id != exclude_project_id,
        )
        .first()
        is not None
    )