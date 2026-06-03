from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.auth_deps import get_current_user
from app.services.projects_service import is_member
from app.services.plan_service import list_blocks
from app.models.task import Task

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


@router.get("/projects/{project_id}/plan/export-ics")
def export_plan_ics(
    project_id: int,
    date_from: datetime = Query(..., alias="from"),
    date_to: datetime = Query(..., alias="to"),
    user_id: int | None = None,
    only_planned: bool = True,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Members can export plan for the project
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    # Default: export only for current user
    if user_id is None:
        user_id = current_user.id

    # If filtering by user_id, make sure that user is also a member
    if user_id is not None and not is_member(db, project_id, user_id):
        raise HTTPException(status_code=400, detail="user_id is not a project member")

    blocks = list_blocks(db, project_id, date_from, date_to, user_id=user_id)

    if only_planned:
        blocks = [b for b in blocks if b.block_status == "PLANNED"]
    
    # Fetch task titles (avoid N queries)
    task_ids = list({b.task_id for b in blocks})
    tasks = db.query(Task).filter(Task.id.in_(task_ids)).all() if task_ids else []
    title_by_task = {t.id: t.title for t in tasks}

    now = datetime.now(timezone.utc)

    lines: list[str] = []
    lines.append("BEGIN:VCALENDAR")
    lines.append("VERSION:2.0")
    lines.append("PRODID:-//Licenta Planner//EN")
    lines.append("CALSCALE:GREGORIAN")
    lines.append("METHOD:PUBLISH")

    for b in blocks:
        start_dt = as_utc(b.start_datetime)
        end_dt = as_utc(b.end_datetime)

        task_title = title_by_task.get(b.task_id, f"Task {b.task_id}")
        summary = f"{task_title} ({b.planned_minutes} min)"
        desc = f"Project {b.project_id}, Task {b.task_id}, User {b.user_id}, Block {b.id}, Status {b.block_status}"

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

    filename = f"project_{project_id}_plan.ics"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    return Response(content=ics_text, media_type="text/calendar; charset=utf-8", headers=headers)