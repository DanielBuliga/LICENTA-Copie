from sqlalchemy.orm import Session

from app.models.skill import Skill
from app.models.skill_alias import SkillAlias


def list_skills(db: Session) -> list[Skill]:
    return db.query(Skill).order_by(Skill.name.asc()).all()


def get_skill(db: Session, skill_id: int) -> Skill | None:
    return db.query(Skill).filter(Skill.id == skill_id).first()


def get_skill_by_name(db: Session, name: str) -> Skill | None:
    return db.query(Skill).filter(Skill.name == name).first()


def create_skill(db: Session, name: str) -> Skill:
    skill = Skill(name=name)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


def list_skill_aliases(db: Session, skill_id: int) -> list[SkillAlias]:
    return db.query(SkillAlias).filter(SkillAlias.skill_id == skill_id).order_by(SkillAlias.alias.asc()).all()


def get_skill_alias(db: Session, alias_id: int) -> SkillAlias | None:
    return db.query(SkillAlias).filter(SkillAlias.id == alias_id).first()


def create_skill_alias(db: Session, skill_id: int, alias: str) -> SkillAlias:
    skill_alias = SkillAlias(skill_id=skill_id, alias=alias.strip())
    db.add(skill_alias)
    db.commit()
    db.refresh(skill_alias)
    return skill_alias


def delete_skill_alias(db: Session, alias: SkillAlias) -> None:
    db.delete(alias)
    db.commit()


def delete_skill(db: Session, skill: Skill) -> None:
    db.query(SkillAlias).filter(SkillAlias.skill_id == skill.id).delete()
    db.delete(skill)
    db.commit()
