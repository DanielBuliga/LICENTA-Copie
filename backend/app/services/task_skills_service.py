from sqlalchemy.orm import Session

from app.models.task_skill_requirement import TaskSkillRequirement


def list_task_requirements(db: Session, task_id: int) -> list[TaskSkillRequirement]:
    return db.query(TaskSkillRequirement).filter(TaskSkillRequirement.task_id == task_id).all()


def replace_task_requirements(db: Session, task_id: int, items: list[tuple[int, int]]) -> list[TaskSkillRequirement]:
    # items: list of (skill_id, min_level)
    db.query(TaskSkillRequirement).filter(TaskSkillRequirement.task_id == task_id).delete()
    db.commit()

    for skill_id, min_level in items:
        row = TaskSkillRequirement(task_id=task_id, skill_id=skill_id, min_level=min_level)
        db.add(row)

    db.commit()
    return list_task_requirements(db, task_id)