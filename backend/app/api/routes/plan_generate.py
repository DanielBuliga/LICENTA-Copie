from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.auth_deps import get_current_user
from app.core.permissions import require_roles

from app.schemas.plan_generate import PlanGenerateRequest, PlanGenerateResponse, AtRiskItem
from app.schemas.replan import ReplanRequest

from app.services.projects_service import is_member, list_members
from app.services.tasks_service import leaf_tasks
from app.services.dependencies_service import list_dependencies
from app.services.eligibility_service import eligible_members_for_task
from app.services.assignments_service import create_assignment, list_assigned_user_ids
from app.services.slot_builder import build_free_slots_for_user
from app.services.planning_engine import pack_task_into_slots, as_utc
from app.services.notification_service import notify_plan_problems, notify_task_assigned, notify_task_replanned
from app.services.activity_service import log_project_activity
from app.services.problems_service import compute_problems

from app.models.scheduled_block import ScheduledBlock
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.utils.time_utils import utc_naive, local_midnight_to_utc

router = APIRouter(prefix="/projects/{project_id}/plan", tags=["plan-generate"])


def _pick_best_user(
    candidate_users: list[int],
    slots_by_user: dict[int, list[tuple]],
    earliest_start: datetime,
    deadline_utc: datetime,
) -> tuple[int | None, int]:
    best_user = None
    best_free = -1

    for u in candidate_users:
        free_minutes = 0
        for s, e in slots_by_user[u]:
            s = as_utc(s)
            e = as_utc(e)

            if e <= earliest_start:
                continue

            s2 = max(s, earliest_start)
            if s2 >= deadline_utc:
                continue

            end_limit = min(e, deadline_utc)
            if end_limit > s2:
                free_minutes += int((end_limit - s2).total_seconds() // 60)

        if free_minutes > best_free:
            best_free = free_minutes
            best_user = u

    return best_user, best_free


def _block_signature(blocks: list[ScheduledBlock]) -> tuple[tuple[datetime, datetime, int], ...]:
    return tuple(
        (block.start_datetime, block.end_datetime, block.planned_minutes)
        for block in sorted(blocks, key=lambda item: (item.start_datetime, item.end_datetime, item.id))
    )


def _format_schedule(signature: tuple[tuple[datetime, datetime, int], ...] | None) -> str | None:
    if not signature:
        return None
    parts = []
    for start, end, minutes in signature:
        parts.append(f"{start.strftime('%d.%m.%Y %H:%M')} - {end.strftime('%H:%M')} ({minutes} min)")
    return "; ".join(parts)


def _load_schedule_signatures(
    db: Session,
    project_id: int,
    start_dt: datetime,
    end_dt: datetime,
) -> dict[tuple[int, int], tuple[tuple[datetime, datetime, int], ...]]:
    rows = (
        db.query(ScheduledBlock)
        .filter(
            ScheduledBlock.project_id == project_id,
            ScheduledBlock.start_datetime >= start_dt,
            ScheduledBlock.start_datetime < end_dt,
        )
        .all()
    )
    grouped: dict[tuple[int, int], list[ScheduledBlock]] = {}
    for block in rows:
        grouped.setdefault((block.task_id, block.user_id), []).append(block)
    return {key: _block_signature(value) for key, value in grouped.items()}


@router.post("/generate", response_model=PlanGenerateResponse)
def generate_plan(
    project_id: int,
    payload: PlanGenerateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Must be member
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    # Only OWNER/ADMIN can generate/replan team plan
    require_roles(db, project_id, current_user.id, {"OWNER", "ADMIN"})

    start_day = payload.start_day
    horizon_days = payload.horizon_days

    # Time range for SQL deletes (UTC naive)
    start_dt_aware = local_midnight_to_utc(start_day)  # aware UTC
    start_dt = utc_naive(start_dt_aware)               # naive UTC (for SQL)
    end_dt = start_dt + timedelta(days=horizon_days)   # naive UTC (for SQL)
    old_schedule = _load_schedule_signatures(db, project_id, start_dt, end_dt)
    old_assignment_keys = {
        (assignment.task_id, assignment.user_id)
        for assignment, task in db.query(TaskAssignment, Task)
        .join(Task, Task.id == TaskAssignment.task_id)
        .filter(Task.project_id == project_id)
        .all()
    }

    # Clear existing blocks for this project in the horizon
    db.query(ScheduledBlock).filter(
        ScheduledBlock.project_id == project_id,
        ScheduledBlock.start_datetime >= start_dt,
        ScheduledBlock.start_datetime < end_dt,
    ).delete()
    db.commit()

    # Collect tasks that still need work. READY_TO_CLOSE means all assignees already finished.
    tasks = [t for t in leaf_tasks(db, project_id) if t.status not in {"CLOSED", "READY_TO_CLOSE"}]
    task_ids = {t.id for t in tasks}

    # Build dependency graph
    deps = list_dependencies(db, project_id)
    edges = [(d.predecessor_task_id, d.successor_task_id) for d in deps]

    indeg = {tid: 0 for tid in task_ids}
    succ = {tid: [] for tid in task_ids}
    pred = {tid: [] for tid in task_ids}

    for a, b in edges:
        if a in task_ids and b in task_ids:
            succ[a].append(b)
            pred[b].append(a)
            indeg[b] += 1

    # Initial eligible tasks
    eligible = [t for t in tasks if indeg.get(t.id, 0) == 0]
    eligible.sort(key=lambda x: (as_utc(x.deadline), -x.priority))

    # Prepare members and free slots
    members = list_members(db, project_id, active_only=True)
    member_ids = [m.user_id for m in members]

    slots_by_user: dict[int, list[tuple]] = {}
    for uid in member_ids:
        slots_by_user[uid] = build_free_slots_for_user(db, uid, start_day, horizon_days)

    blocks_created = 0
    assignments_created = 0
    assignments_preserved = 0
    at_risk: list[AtRiskItem] = []

    # Track tasks finish times to enforce dependencies in calendar
    fully_planned: set[int] = set()
    finish_time: dict[int, datetime] = {}

    visited_task_ids: set[int] = set()

    while eligible:
        task = eligible.pop(0)
        visited_task_ids.add(task.id)

        now_utc = datetime.now(timezone.utc)
        deadline_utc = as_utc(task.deadline)

        # Earliest start based on predecessors finish (aware UTC)
        earliest_start = start_dt_aware

        blocked = False
        for p_id in pred.get(task.id, []):
            if p_id not in fully_planned:
                blocked = True
                break

            # IMPORTANT: fallback must be aware (not start_dt naive)
            earliest_start = max(earliest_start, finish_time.get(p_id, start_dt_aware))

        if blocked:
            at_risk.append(AtRiskItem(task_id=task.id, reason="Blocked by predecessor not fully planned"))
        elif deadline_utc <= now_utc:
            at_risk.append(AtRiskItem(task_id=task.id, reason="Deadline already passed"))
        else:
            eligible_users_all = eligible_members_for_task(db, project_id, task.id)
            eligible_users_all = [u for u in eligible_users_all if u in member_ids]

            if not eligible_users_all:
                at_risk.append(AtRiskItem(task_id=task.id, reason="No eligible member (skills)"))
            else:
                assigned_users = list_assigned_user_ids(db, task.id)
                eligible_assigned_users = [u for u in assigned_users if u in eligible_users_all]

                # Manual assignments are authoritative. We only auto-assign unassigned tasks.
                assignment_blocked = False
                if assigned_users and not eligible_assigned_users:
                    at_risk.append(AtRiskItem(task_id=task.id, reason="Assigned member is not eligible (skills)"))
                    candidate_users = []
                    assignment_blocked = True
                else:
                    candidate_users = eligible_assigned_users if assigned_users else eligible_users_all

                best_user, best_free = _pick_best_user(candidate_users, slots_by_user, earliest_start, deadline_utc)

                if assignment_blocked:
                    pass
                elif best_user is None or best_free <= 0:
                    at_risk.append(AtRiskItem(task_id=task.id, reason="No free time until deadline"))
                else:
                    if assigned_users:
                        assignments_preserved += 1
                    else:
                        create_assignment(db, task.id, best_user, task.estimate_minutes)
                        notify_task_assigned(db, task, best_user)
                        assignments_created += 1

                    created, remaining, last_end = pack_task_into_slots(
                        db=db,
                        project_id=project_id,
                        task=task,
                        user_id=best_user,
                        slots=slots_by_user[best_user],
                        earliest_start=earliest_start,
                    )
                    blocks_created += created

                    if remaining > 0:
                        at_risk.append(AtRiskItem(task_id=task.id, reason="Not enough time until deadline"))
                    else:
                        fully_planned.add(task.id)
                        if last_end is not None:
                            finish_time[task.id] = last_end

        # Unlock successors
        for s_id in succ.get(task.id, []):
            indeg[s_id] -= 1
            if indeg[s_id] == 0:
                next_task = next((t for t in tasks if t.id == s_id), None)
                if next_task:
                    eligible.append(next_task)

        eligible.sort(key=lambda x: (as_utc(x.deadline), -x.priority))

    # --- Cycle guard: if some tasks never reached indeg==0, we have a dependency cycle or missing nodes ---
    stuck = [tid for tid, deg in indeg.items() if deg > 0]
    if stuck:
        for tid in stuck:
            at_risk.append(AtRiskItem(task_id=tid, reason="Dependency cycle detected (cannot schedule)"))

    final_problems = compute_problems(db, project_id)
    new_schedule = _load_schedule_signatures(db, project_id, start_dt, end_dt)
    changed_schedule_keys = set(old_schedule.keys()) | set(new_schedule.keys())
    if changed_schedule_keys:
        task_ids_for_notifications = {task_id for task_id, _ in changed_schedule_keys}
        tasks_by_id = {
            task.id: task
            for task in db.query(Task).filter(Task.id.in_(task_ids_for_notifications)).all()
        } if task_ids_for_notifications else {}
        for key in changed_schedule_keys:
            task_id, user_id = key
            old_signature = old_schedule.get(key)
            new_signature = new_schedule.get(key)
            if old_signature == new_signature:
                continue
            if old_signature is None and key not in old_assignment_keys:
                continue
            task = tasks_by_id.get(task_id)
            if not task or task.status == "CLOSED":
                continue
            notify_task_replanned(
                db,
                task=task,
                user_id=user_id,
                old_schedule=_format_schedule(old_signature),
                new_schedule=_format_schedule(new_signature),
            )

    response_at_risk = [
        AtRiskItem(task_id=item["task_id"], reason=f"{item['type']}: {item['reason']}")
        for item in final_problems
        if item.get("task_id") is not None
    ]

    notify_plan_problems(db, project_id, final_problems)
    log_project_activity(
        db,
        project_id,
        "PLAN_GENERATED",
        "Planificare generata",
        actor_id=current_user.id,
        entity_type="PLAN",
        entity_id=project_id,
        details=(
            f"Blocuri create: {blocks_created}. "
            f"Asignari create: {assignments_created}. "
            f"Asignari pastrate: {assignments_preserved}. "
            f"Probleme: {len(response_at_risk)}."
        ),
    )

    return PlanGenerateResponse(
        blocks_created=blocks_created,
        assignments_created=assignments_created,
        assignments_preserved=assignments_preserved,
        at_risk=response_at_risk,
    )


@router.post("/replan", response_model=PlanGenerateResponse)
def replan(
    project_id: int,
    payload: ReplanRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    req = PlanGenerateRequest(start_day=payload.today, horizon_days=payload.horizon_days)
    return generate_plan(project_id=project_id, payload=req, db=db, current_user=current_user)
