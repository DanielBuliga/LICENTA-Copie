from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.models.user_skill import UserSkill


def list_user_skills(db: Session, user_id: int) -> list[UserSkill]:
    return db.query(UserSkill).filter(UserSkill.user_id == user_id).all()


def get_user_skill(db: Session, user_id: int, skill_id: int) -> UserSkill | None:
    return (
        db.query(UserSkill)
        .filter(UserSkill.user_id == user_id, UserSkill.skill_id == skill_id)
        .first()
    )


def add_user_skill(db: Session, user_id: int, skill_id: int, level: int) -> UserSkill:
    row = UserSkill(user_id=user_id, skill_id=skill_id, level=level, validation_status="PENDING")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_user_skill_level(db: Session, row: UserSkill, level: int) -> UserSkill:
    row.level = level
    row.validation_status = "PENDING"
    row.validated_by = None
    row.validated_at = None
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_user_skill(db: Session, row: UserSkill) -> None:
    db.delete(row)
    db.commit()


def validate_user_skill(db: Session, row: UserSkill, level: int | None, status: str, validator_id: int) -> UserSkill:
    if level is not None:
        row.level = level
    row.validation_status = status
    row.validated_by = validator_id
    row.validated_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
