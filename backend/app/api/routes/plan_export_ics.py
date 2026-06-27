from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.auth_deps import get_current_user
from app.services.projects_service import is_member
from app.services.plan_service import list_blocks
from app.models.task import Task
from app.models.project import Project
from app.models.user import User

from app.utils.time_utils import as_utc

router = APIRouter(tags=["plan-export"])

def ics_dt(dt: datetime) -> str:
    # UTC format: YYYYMMDDTHHMMSSZ
    dt = as_utc(dt)
    return dt.strftime("%Y%m%dT%H%M%SZ")


def escape_ics(text: str) -> str:
    # Minimal ICS escaping
    return (
        text.replace("\\", "\\\\")
        .replace("\n", "\\n")
        .replace(",", "\\,")
        .replace(";", "\\;")
    )


def safe_filename_part(text: str) -> str:
    cleaned = "".join(ch if ch.isalnum() else "_" for ch in text.strip())
    cleaned = "_".join(part for part in cleaned.split("_") if part)
    return cleaned or "proiect"


@router.get("/projects/{project_id}/plan/export-ics")
def export_plan_ics(
    project_id: int,
    date_from: datetime = Query(..., alias="from"),
    date_to: datetime = Query(..., alias="to"),
    user_id: int | None = None,
    only_planned: bool = True,
    include_completed: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Members can export plan for the project
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Nu ești membru al acestui proiect.")

    # Default: export only for current user
    if user_id is None:
        user_id = current_user.id

    # If filtering by user_id, make sure that user is also a member
    if user_id is not None and not is_member(db, project_id, user_id):
        raise HTTPException(status_code=400, detail="Utilizatorul selectat nu este membru al proiectului.")

    project = db.query(Project).filter(Project.id == project_id).first()
    blocks = list_blocks(db, project_id, date_from, date_to, user_id=user_id)

    if only_planned:
        blocks = [b for b in blocks if b.block_status == "PLANNED"]
    
    # Fetch task metadata (avoid N queries)
    task_ids = list({b.task_id for b in blocks})
    tasks = db.query(Task).filter(Task.id.in_(task_ids)).all() if task_ids else []
    task_by_id = {t.id: t for t in tasks}
    user_ids = list({b.user_id for b in blocks})
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    user_by_id = {u.id: u for u in users}

    if not include_completed:
        blocks = [
            b
            for b in blocks
            if task_by_id.get(b.task_id) and task_by_id[b.task_id].status not in {"READY_TO_CLOSE", "CLOSED"}
        ]

    now = datetime.now(timezone.utc)

    lines: list[str] = []
    lines.append("BEGIN:VCALENDAR")
    lines.append("VERSION:2.0")
    lines.append("PRODID:-//Smart Planner//RO")
    lines.append("CALSCALE:GREGORIAN")
    lines.append("METHOD:PUBLISH")

    for b in blocks:
        start_dt = as_utc(b.start_datetime)
        end_dt = as_utc(b.end_datetime)

        task = task_by_id.get(b.task_id)
        task_title = task.title if task else f"Task {b.task_id}"
        summary = f"{task_title} ({b.planned_minutes} min)"
        task_status = task.status if task else "UNKNOWN"
        project_title = project.title if project else f"Proiect {b.project_id}"
        user = user_by_id.get(b.user_id)
        user_label = user.name or user.email if user else f"Utilizator {b.user_id}"
        desc = (
            f"Proiect: {project_title}\n"
            f"Task: {task_title}\n"
            f"Responsabil: {user_label}\n"
            f"Status bloc: {b.block_status}\n"
            f"Status task: {task_status}"
        )

        lines.append("BEGIN:VEVENT")
        lines.append(f"UID:block-{b.id}@licenta-planner")
        lines.append(f"DTSTAMP:{ics_dt(now)}")
        lines.append(f"DTSTART:{ics_dt(start_dt)}")
        lines.append(f"DTEND:{ics_dt(end_dt)}")
        lines.append(f"SUMMARY:{escape_ics(summary)}")
        lines.append(f"DESCRIPTION:{escape_ics(desc)}")
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")

    ics_text = "\r\n".join(lines) + "\r\n"

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M")
    project_name = safe_filename_part(project.title if project else f"proiect_{project_id}")
    filename = f"{project_name}_plan_{timestamp}.ics"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    return Response(content=ics_text, media_type="text/calendar; charset=utf-8", headers=headers)
