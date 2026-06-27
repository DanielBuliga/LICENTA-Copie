from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.auth_deps import get_current_user
from app.core.permissions import require_roles

from app.schemas.skill import TaskSkillExtractionResponse, TaskSkillsUpdate
from app.services.projects_service import is_member
from app.services.tasks_service import get_task, has_subtasks
from app.services.skills_service import get_skill
from app.services.task_skills_service import list_task_requirements, replace_task_requirements
from app.services.eligibility_service import eligible_members_for_task
from app.services.skill_extraction_service import extract_task_skills
from app.services.notification_service import notify_plan_impact

router = APIRouter(prefix="/tasks", tags=["task-skills"])


def _notify_task_skills_changed(db: Session, task, current_user) -> None:
    notify_plan_impact(
        db,
        project_id=task.project_id,
        title=f"Competențe actualizate: {task.title}",
        body=(
            f"Competențele necesare pentru taskul {task.title} au fost modificate. "
            "Verifică tabul Probleme sau rulează replanificarea dacă asignarea curentă nu mai este validă."
        ),
        actor_id=None,
        task_id=task.id,
    )


@router.get("/{task_id}/skills")
def get_task_skills(task_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    task = get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Taskul nu a fost găsit.")

    if not is_member(db, task.project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Nu ești membru al acestui proiect.")

    rows = list_task_requirements(db, task_id)
    return [
        {"skill_id": r.skill_id, "name": skill.name if (skill := get_skill(db, r.skill_id)) else f"Skill {r.skill_id}"}
        for r in rows
    ]


@router.put("/{task_id}/skills")
def put_task_skills(task_id: int, payload: TaskSkillsUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    task = get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Taskul nu a fost găsit.")

    if not is_member(db, task.project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Nu ești membru al acestui proiect.")

    # Only OWNER/ADMIN can change task skill requirements
    require_roles(db, task.project_id, current_user.id, {"OWNER", "ADMIN"})

    if has_subtasks(db, task.id):
        raise HTTPException(status_code=400, detail="Taskurile cu subtaskuri sunt containere; competențele se setează pe subtaskuri.")

    # No duplicates in request
    seen = set()
    for it in payload.skills:
        if it.skill_id in seen:
            raise HTTPException(status_code=400, detail="Aceeași competență apare de mai multe ori în cerere.")
        seen.add(it.skill_id)

        if not get_skill(db, it.skill_id):
            raise HTTPException(status_code=400, detail=f"Competența nu este validă: {it.skill_id}")

    old_skill_ids = {row.skill_id for row in list_task_requirements(db, task_id)}
    new_skill_ids = {it.skill_id for it in payload.skills}
    rows = replace_task_requirements(db, task_id, [it.skill_id for it in payload.skills])
    if old_skill_ids != new_skill_ids:
        _notify_task_skills_changed(db, task, current_user)

    return [
        {"skill_id": r.skill_id, "name": skill.name if (skill := get_skill(db, r.skill_id)) else f"Skill {r.skill_id}"}
        for r in rows
    ]


@router.post("/{task_id}/skills/extract", response_model=TaskSkillExtractionResponse)
def extract_skills_for_task(
    task_id: int,
    apply: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Taskul nu a fost găsit.")

    if not is_member(db, task.project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Nu ești membru al acestui proiect.")

    if has_subtasks(db, task.id):
        raise HTTPException(status_code=400, detail="Taskurile cu subtaskuri sunt containere; extrage competențe pentru subtaskuri.")

    result = extract_task_skills(db, task)
    result["applied"] = False

    if apply:
        require_roles(db, task.project_id, current_user.id, {"OWNER", "ADMIN"})
        old_skill_ids = {row.skill_id for row in list_task_requirements(db, task_id)}
        skill_ids = [item["skill_id"] for item in result["suggestions"] if item["confidence"] >= 0.9]
        if skill_ids:
            replace_task_requirements(db, task_id, skill_ids)
            if old_skill_ids != set(skill_ids):
                _notify_task_skills_changed(db, task, current_user)
        result["applied"] = True

    return result


@router.get("/{task_id}/eligible-members")
def get_eligible(task_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    task = get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Taskul nu a fost găsit.")

    if not is_member(db, task.project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Nu ești membru al acestui proiect.")

    if has_subtasks(db, task.id):
        return {"eligible_user_ids": []}

    user_ids = eligible_members_for_task(db, task.project_id, task_id)
    return {"eligible_user_ids": user_ids}
