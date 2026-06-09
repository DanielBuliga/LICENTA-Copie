from sqlalchemy.orm import Session

from app.models.task_skill_requirement import TaskSkillRequirement


def list_task_requirements(db: Session, task_id: int) -> list[TaskSkillRequirement]:
    return db.query(TaskSkillRequirement).filter(TaskSkillRequirement.task_id == task_id).all()


def replace_task_requirements(db: Session, task_id: int, skill_ids: list[int]) -> list[TaskSkillRequirement]:
    db.query(TaskSkillRequirement).filter(TaskSkillRequirement.task_id == task_id).delete()
    db.commit()

    for skill_id in skill_ids:
        row = TaskSkillRequirement(task_id=task_id, skill_id=skill_id)
        db.add(row)

    db.commit()
    return list_task_requirements(db, task_id)
