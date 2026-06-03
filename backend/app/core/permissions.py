from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.services.projects_service import get_member_role

def require_roles(db: Session, project_id: int, user_id: int, allowed: set[str]):
    role = get_member_role(db, project_id, user_id)
    if role not in allowed:
        raise HTTPException(status_code=403, detail="Not enough permissions")