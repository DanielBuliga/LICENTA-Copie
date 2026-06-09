from sqlalchemy.orm import Session
from app.models.user_skill import UserSkill


def list_user_skills(db: Session, user_id: int) -> list[UserSkill]:
    return db.query(UserSkill).filter(UserSkill.user_id == user_id).all()


def get_user_skill(db: Session, user_id: int, skill_id: int) -> UserSkill | None:
    return (
        db.query(UserSkill)
        .filter(UserSkill.user_id == user_id, UserSkill.skill_id == skill_id)
        .first()
    )


def add_user_skill(db: Session, user_id: int, skill_id: int) -> UserSkill:
    row = UserSkill(user_id=user_id, skill_id=skill_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_user_skill(db: Session, row: UserSkill) -> None:
    db.delete(row)
    db.commit()
