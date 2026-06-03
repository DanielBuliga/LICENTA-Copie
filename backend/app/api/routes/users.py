from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth_deps import get_current_user
from app.core.deps import get_db
from app.schemas.user import UserPublic
from app.services.user_delete_service import delete_user_account

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserPublic)
def me(current_user=Depends(get_current_user)):
    return current_user


@router.delete("/me", status_code=204)
def delete_me(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    delete_user_account(db, current_user.id)
    return None
