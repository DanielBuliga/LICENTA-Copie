from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_deps import get_current_user
from app.core.deps import get_db
from app.models.project_message import ProjectMessage
from app.models.user import User
from app.schemas.message import MessageCreate, MessagePublic
from app.services.projects_service import is_member
from app.services.notification_service import notify_project_message

router = APIRouter(tags=["messages"])


def to_public(db: Session, message: ProjectMessage) -> MessagePublic:
    user = db.query(User).filter(User.id == message.sender_id).first()
    created_at = message.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return MessagePublic(
        id=message.id,
        project_id=message.project_id,
        sender_id=message.sender_id,
        sender_name=user.name if user else None,
        sender_email=user.email if user else None,
        content=message.content,
        created_at=created_at,
    )


@router.get("/projects/{project_id}/messages", response_model=list[MessagePublic])
def list_project_messages(
    project_id: int,
    after_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Nu ești membru al acestui proiect.")

    query = db.query(ProjectMessage).filter(ProjectMessage.project_id == project_id)
    if after_id is not None:
        query = query.filter(ProjectMessage.id > after_id)

    rows = query.order_by(ProjectMessage.id.asc()).limit(100).all()
    return [to_public(db, row) for row in rows]


@router.post("/projects/{project_id}/messages", response_model=MessagePublic, status_code=201)
def create_project_message(
    project_id: int,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Nu ești membru al acestui proiect.")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Mesajul nu poate fi gol.")

    row = ProjectMessage(project_id=project_id, sender_id=current_user.id, content=content)
    db.add(row)
    db.commit()
    db.refresh(row)
    notify_project_message(db, project_id, row.id, current_user.id, current_user.name or current_user.email, row.content)
    return to_public(db, row)
