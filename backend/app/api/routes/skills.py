from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.deps import get_db
from app.core.auth_deps import get_current_user

from app.schemas.skill import SkillCreate, SkillPublic, SkillUpdate
from app.services.skills_service import list_skills, create_skill, get_skill_by_name, get_skill

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=list[SkillPublic])
def get_all_skills(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    return list_skills(db)


@router.post("", response_model=SkillPublic, status_code=201)
def add_skill(payload: SkillCreate, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    existing = get_skill_by_name(db, payload.name)
    if existing:
        raise HTTPException(status_code=400, detail="Skill already exists")
    return create_skill(db, payload.name)


@router.patch("/{skill_id}", response_model=SkillPublic)
def rename_skill(
    skill_id: int,
    payload: SkillUpdate,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    skill = get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    existing = get_skill_by_name(db, payload.name)
    if existing and existing.id != skill_id:
        raise HTTPException(status_code=400, detail="Skill name already exists")

    skill.name = payload.name
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


@router.delete("/{skill_id}", status_code=204)
def delete_skill(
    skill_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    skill = get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    try:
        db.delete(skill)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Skill is used by users/tasks and cannot be deleted")

    return None