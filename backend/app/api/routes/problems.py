from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.auth_deps import get_current_user
from app.services.projects_service import is_member
from app.core.permissions import require_roles
from app.schemas.problems import ProblemsResponse, ProblemItem
from app.services.problems_service import compute_problems

router = APIRouter(prefix="/projects/{project_id}/plan", tags=["plan-problems"])


@router.get("/problems", response_model=ProblemsResponse)
def get_plan_problems(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Members can view problems (read-only)
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Nu ești membru al acestui proiect.")

    problems = compute_problems(db, project_id)
    return ProblemsResponse(problems=[ProblemItem(**p) for p in problems])