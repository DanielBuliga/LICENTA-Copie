from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.auth_deps import get_current_user
from app.schemas.plan import ScheduledBlockPublic, BlockStatusUpdate
from app.services.projects_service import is_member
from app.services.plan_service import list_blocks, get_block

router = APIRouter(tags=["plan"])

ALLOWED_BLOCK_STATUS = {"PLANNED", "DONE", "SKIPPED"}


@router.get("/projects/{project_id}/plan", response_model=list[ScheduledBlockPublic])
def get_project_plan(
    project_id: int,
    date_from: datetime = Query(..., alias="from"),
    date_to: datetime = Query(..., alias="to"),
    user_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    # If filtering by user_id, make sure that user is also a member
    if user_id is not None and not is_member(db, project_id, user_id):
        raise HTTPException(status_code=400, detail="user_id is not a project member")

    return list_blocks(db, project_id, date_from, date_to, user_id=user_id)


@router.patch("/plan/blocks/{block_id}", response_model=ScheduledBlockPublic)
def update_block_status(
    block_id: int,
    payload: BlockStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    block = get_block(db, block_id)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")

    if not is_member(db, block.project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    # For MVP: only the assigned user can mark their blocks DONE/SKIPPED
    if current_user.id != block.user_id:
        raise HTTPException(status_code=403, detail="You can only update your own blocks")

    if payload.block_status not in ALLOWED_BLOCK_STATUS:
        raise HTTPException(status_code=400, detail="Invalid block_status")

    block.block_status = payload.block_status
    db.add(block)
    db.commit()
    db.refresh(block)
    return block