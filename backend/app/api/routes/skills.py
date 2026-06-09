from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.deps import get_db
from app.core.auth_deps import get_current_user

from app.schemas.skill import SkillAliasCreate, SkillAliasPublic, SkillCreate, SkillPublic, SkillUpdate
from app.services.skills_service import (
    create_skill,
    create_skill_alias,
    delete_skill as delete_skill_service,
    delete_skill_alias,
    get_skill,
    get_skill_alias,
    get_skill_by_name,
    list_skill_aliases,
    list_skills,
)

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
        delete_skill_service(db, skill)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Skill is used by users/tasks and cannot be deleted")

    return None


@router.get("/{skill_id}/aliases", response_model=list[SkillAliasPublic])
def get_aliases(skill_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    skill = get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return list_skill_aliases(db, skill_id)


@router.post("/{skill_id}/aliases", response_model=SkillAliasPublic, status_code=201)
def add_alias(
    skill_id: int,
    payload: SkillAliasCreate,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    skill = get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    alias = payload.alias.strip()
    if not alias:
        raise HTTPException(status_code=400, detail="Alias cannot be empty")

    try:
        return create_skill_alias(db, skill_id, alias)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Alias already exists for this skill")


@router.delete("/{skill_id}/aliases/{alias_id}", status_code=204)
def remove_alias(
    skill_id: int,
    alias_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    alias = get_skill_alias(db, alias_id)
    if not alias or alias.skill_id != skill_id:
        raise HTTPException(status_code=404, detail="Alias not found")

    delete_skill_alias(db, alias)
    return None
