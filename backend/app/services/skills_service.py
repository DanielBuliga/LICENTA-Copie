from sqlalchemy.orm import Session

from app.models.skill import Skill


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


def delete_skill(db: Session, skill: Skill) -> None:
    db.delete(skill)
    db.commit()