from sqlalchemy.orm import Session

from app.models.project_member import ProjectMember
from app.models.user_skill import UserSkill
from app.models.task_skill_requirement import TaskSkillRequirement


def eligible_members_for_task(db: Session, project_id: int, task_id: int) -> list[int]:
    # Returns list of user_ids eligible for task (have all required skills)
    reqs = db.query(TaskSkillRequirement).filter(TaskSkillRequirement.task_id == task_id).all()

    # If no requirements, everyone in project is eligible
    if not reqs:
        members = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
        return [m.user_id for m in members]

    req_map = {r.skill_id: r.min_level for r in reqs}

    members = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
    eligible: list[int] = []

    for m in members:
        skills = db.query(UserSkill).filter(UserSkill.user_id == m.user_id).all()
        user_map = {s.skill_id: s.level for s in skills}

        ok = True
        for skill_id, min_level in req_map.items():
            if user_map.get(skill_id, 0) < min_level:
                ok = False
                break

        if ok:
            eligible.append(m.user_id)

    return eligible