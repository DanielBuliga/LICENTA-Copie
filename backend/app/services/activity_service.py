from sqlalchemy.orm import Session

from app.models.project_activity import ProjectActivity
from app.models.user import User


def log_project_activity(
    db: Session,
    project_id: int,
    event_type: str,
    title: str,
    actor_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    details: str | None = None,
    commit: bool = True,
) -> ProjectActivity:
    row = ProjectActivity(
        project_id=project_id,
        actor_id=actor_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        title=title,
        details=details,
    )
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
    return row


def list_project_activities(
    db: Session,
    project_id: int,
    offset: int = 0,
    limit: int = 200,
) -> list[tuple[ProjectActivity, User | None]]:
    return (
        db.query(ProjectActivity, User)
        .outerjoin(User, User.id == ProjectActivity.actor_id)
        .filter(ProjectActivity.project_id == project_id)
        .order_by(ProjectActivity.created_at.desc(), ProjectActivity.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
