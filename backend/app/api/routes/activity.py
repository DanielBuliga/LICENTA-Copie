from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth_deps import get_current_user
from app.core.deps import get_db
from app.schemas.activity import ProjectActivityPublic
from app.services.activity_service import list_project_activities
from app.services.projects_service import is_member

router = APIRouter(prefix="/projects/{project_id}/activity", tags=["activity"])


@router.get("", response_model=list[ProjectActivityPublic])
def get_project_activity(
    project_id: int,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    rows = list_project_activities(db, project_id, offset=offset, limit=limit)
    return [
        ProjectActivityPublic(
            id=activity.id,
            project_id=activity.project_id,
            actor_id=activity.actor_id,
            actor_name=user.name if user else None,
            actor_email=user.email if user else None,
            event_type=activity.event_type,
            entity_type=activity.entity_type,
            entity_id=activity.entity_id,
            title=activity.title,
            details=activity.details,
            created_at=activity.created_at,
        )
        for activity, user in rows
    ]
