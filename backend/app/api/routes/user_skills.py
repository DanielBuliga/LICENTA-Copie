from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.auth_deps import get_current_user
from app.schemas.skill import MemberSkillPublic, MemberSkillValidationUpdate, UserSkillAdd, UserSkillPublic, UserSkillUpdate
from app.services.user_skills_service import (
    list_user_skills,
    get_user_skill,
    add_user_skill,
    update_user_skill_level,
    delete_user_skill,
    validate_user_skill,
)
from app.services.skills_service import get_skill
from app.models.project_member import ProjectMember
from app.models.user import User
from app.models.user_skill import UserSkill
from app.core.permissions import require_roles
from app.services.projects_service import is_member

router = APIRouter(tags=["user-skills"])


@router.get("/users/me/skills", response_model=list[UserSkillPublic])
def get_my_skills(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    rows = list_user_skills(db, current_user.id)
    return rows


@router.post("/users/me/skills", status_code=201, response_model=UserSkillPublic)
def post_my_skill(payload: UserSkillAdd, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # Validate skill exists
    if not get_skill(db, payload.skill_id):
        raise HTTPException(status_code=400, detail=f"Invalid skill_id {payload.skill_id}")

    existing = get_user_skill(db, current_user.id, payload.skill_id)
    if existing:
        raise HTTPException(status_code=400, detail="Skill already added")

    row = add_user_skill(db, current_user.id, payload.skill_id, payload.level)
    return row


@router.patch("/users/me/skills/{skill_id}", response_model=UserSkillPublic)
def patch_my_skill(skill_id: int, payload: UserSkillUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    row = get_user_skill(db, current_user.id, skill_id)
    if not row:
        raise HTTPException(status_code=404, detail="Skill not found for this user")

    row = update_user_skill_level(db, row, payload.level)
    return row


@router.delete("/users/me/skills/{skill_id}", status_code=204)
def delete_my_skill(skill_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    row = get_user_skill(db, current_user.id, skill_id)
    if not row:
        raise HTTPException(status_code=404, detail="Skill not found for this user")

    delete_user_skill(db, row)
    return None


@router.get("/projects/{project_id}/member-skills", response_model=list[MemberSkillPublic])
def get_project_member_skills(project_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")
    member_ids = [row.user_id for row in db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()]
    users = db.query(User).filter(User.id.in_(member_ids)).all() if member_ids else []
    users_by_id = {user.id: user for user in users}
    rows = db.query(UserSkill).filter(UserSkill.user_id.in_(member_ids)).all() if member_ids else []
    return [
        MemberSkillPublic(
            user_id=row.user_id,
            user_name=users_by_id.get(row.user_id).name if users_by_id.get(row.user_id) else None,
            user_email=users_by_id.get(row.user_id).email if users_by_id.get(row.user_id) else None,
            skill_id=row.skill_id,
            level=row.level,
            validation_status=row.validation_status,
            validated_by=row.validated_by,
        )
        for row in rows
    ]


@router.patch("/projects/{project_id}/members/{user_id}/skills/{skill_id}", response_model=MemberSkillPublic)
def validate_project_member_skill(
    project_id: int,
    user_id: int,
    skill_id: int,
    payload: MemberSkillValidationUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_roles(db, project_id, current_user.id, {"OWNER", "ADMIN"})
    if not is_member(db, project_id, user_id):
        raise HTTPException(status_code=400, detail="User is not a project member")
    row = get_user_skill(db, user_id, skill_id)
    if not row:
        raise HTTPException(status_code=404, detail="Skill not found for this user")
    row = validate_user_skill(db, row, payload.level, payload.validation_status, current_user.id)
    user = db.query(User).filter(User.id == user_id).first()
    return MemberSkillPublic(
        user_id=row.user_id,
        user_name=user.name if user else None,
        user_email=user.email if user else None,
        skill_id=row.skill_id,
        level=row.level,
        validation_status=row.validation_status,
        validated_by=row.validated_by,
    )
