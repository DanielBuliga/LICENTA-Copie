from datetime import datetime, timedelta, timezone
import hashlib

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.notification import Notification, NotificationDeliveryLog, NotificationPreference
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.scheduled_block import ScheduledBlock
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.user import User
from app.services.email_service import send_notification_email


def parse_hours(value: str) -> list[int]:
    hours: list[int] = []
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            hour = int(item)
        except ValueError:
            continue
        if 1 <= hour <= 24 * 30:
            hours.append(hour)
    return sorted(set(hours), reverse=True) or [24, 6, 1]


def format_hours(hours: list[int]) -> str:
    return ",".join(str(hour) for hour in sorted(set(hours), reverse=True))


def parse_minutes(value: str) -> list[int]:
    minutes: list[int] = []
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            minute = int(item)
        except ValueError:
            continue
        if 1 <= minute <= 24 * 60:
            minutes.append(minute)
    return sorted(set(minutes), reverse=True) or [60, 15]


def format_minutes(minutes: list[int]) -> str:
    return ",".join(str(minute) for minute in sorted(set(minutes), reverse=True))


def get_or_create_preferences(db: Session, user_id: int) -> NotificationPreference:
    prefs = db.query(NotificationPreference).filter(NotificationPreference.user_id == user_id).first()
    if prefs:
        return prefs
    prefs = NotificationPreference(user_id=user_id)
    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return prefs


def should_send_for_type(prefs: NotificationPreference, notification_type: str) -> bool:
    if notification_type in {"PROJECT_MEMBER_ADDED", "MEMBER_INACTIVE_REPLAN", "PLAN_PROBLEMS", "PLAN_IMPACT", "MISSED_PLANNED_WORK"}:
        return prefs.project_events_enabled
    if notification_type in {"TASK_ASSIGNED", "TASK_CHANGED", "TASK_REPLANNED", "TASK_UNASSIGNED", "TASK_DELETED"}:
        return prefs.assignment_events_enabled
    if notification_type == "PROJECT_MESSAGE":
        return prefs.message_events_enabled
    if notification_type == "TASK_READY_TO_CLOSE":
        return prefs.ready_to_close_enabled
    if notification_type == "PROJECT_COMPLETED":
        return prefs.project_completed_enabled
    if notification_type == "DEADLINE_REMINDER":
        return prefs.deadline_reminders_enabled
    if notification_type == "SCHEDULED_BLOCK_REMINDER":
        return prefs.scheduled_block_reminders_enabled
    return True


def create_notification(
    db: Session,
    user_id: int,
    notification_type: str,
    title: str,
    body: str,
    project_id: int | None = None,
    task_id: int | None = None,
    event_key: str | None = None,
    email: bool = False,
) -> Notification | None:
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or getattr(user, "status", "ACTIVE") != "ACTIVE":
            return None
        prefs = get_or_create_preferences(db, user_id)
        if not should_send_for_type(prefs, notification_type):
            return None

        if event_key:
            log = NotificationDeliveryLog(user_id=user_id, event_key=event_key)
            db.add(log)
            try:
                db.flush()
            except IntegrityError:
                db.rollback()
                return None
        else:
            log = None

        notification = Notification(
            user_id=user_id,
            type=notification_type,
            title=title,
            body=body,
            project_id=project_id,
            task_id=task_id,
            entity_key=event_key,
            is_read=not prefs.in_app_enabled,
        )
        db.add(notification)
        db.flush()
        if log:
            log.notification_id = notification.id
            db.add(log)
        db.commit()
        db.refresh(notification)

        if email and prefs.email_enabled:
            try:
                send_notification_email(db, user_id, notification)
            except Exception:
                # Email failures must not break the product workflow.
                pass

        return notification
    except SQLAlchemyError:
        db.rollback()
        return None


def notify_member_added(db: Session, project: Project, user_id: int, actor_name: str | None = None) -> None:
    create_notification(
        db,
        user_id=user_id,
        notification_type="PROJECT_MEMBER_ADDED",
        title=f"Ai fost adăugat în proiectul {project.title}",
        body=f"{actor_name or 'Un owner'} te-a adăugat în proiectul {project.title}.",
        project_id=project.id,
        event_key=f"project:{project.id}:member-added:{user_id}",
    )


def notify_task_assigned(db: Session, task: Task, user_id: int) -> None:
    project = db.query(Project).filter(Project.id == task.project_id).first()
    create_notification(
        db,
        user_id=user_id,
        notification_type="TASK_ASSIGNED",
        title=f"Task asignat: {task.title}",
        body=f"Ai primit un task în proiectul {project.title if project else 'proiect'} cu deadline {task.deadline}.",
        project_id=task.project_id,
        task_id=task.id,
        event_key=f"task:{task.id}:assigned:{user_id}",
    )


def notify_task_changed(
    db: Session,
    task: Task,
    changed_labels: list[str],
    actor_id: int | None = None,
) -> None:
    if not changed_labels:
        return
    assignments = db.query(TaskAssignment).filter(TaskAssignment.task_id == task.id).all()
    if not assignments:
        return
    project = db.query(Project).filter(Project.id == task.project_id).first()
    changed_text = ", ".join(changed_labels)
    for assignment in assignments:
        create_notification(
            db,
            user_id=assignment.user_id,
            notification_type="TASK_CHANGED",
            title=f"Task modificat: {task.title}",
            body=(
                f"Taskul {task.title} din proiectul {project.title if project else 'proiect'} "
                f"a fost modificat: {changed_text}."
            ),
            project_id=task.project_id,
            task_id=task.id,
        )


def notify_task_unassigned(db: Session, task: Task, user_id: int) -> None:
    project = db.query(Project).filter(Project.id == task.project_id).first()
    create_notification(
        db,
        user_id=user_id,
        notification_type="TASK_UNASSIGNED",
        title=f"Nu mai ești responsabil pentru: {task.title}",
        body=f"Ai fost scos de pe taskul {task.title} din proiectul {project.title if project else 'proiect'}.",
        project_id=task.project_id,
        task_id=task.id,
    )


def notify_task_deleted(
    db: Session,
    project_id: int,
    task_id: int,
    task_title: str,
    user_ids: list[int],
    actor_id: int | None = None,
) -> None:
    project = db.query(Project).filter(Project.id == project_id).first()
    for user_id in sorted(set(user_ids)):
        if actor_id is not None and user_id == actor_id:
            continue
        create_notification(
            db,
            user_id=user_id,
            notification_type="TASK_DELETED",
            title=f"Task șters: {task_title}",
            body=f"Taskul {task_title} din proiectul {project.title if project else 'proiect'} a fost șters.",
            project_id=project_id,
            task_id=None,
            event_key=f"task:{task_id}:deleted:{user_id}",
        )


def notify_task_replanned(
    db: Session,
    task: Task,
    user_id: int,
    old_schedule: str | None,
    new_schedule: str | None,
) -> None:
    project = db.query(Project).filter(Project.id == task.project_id).first()
    if old_schedule and new_schedule:
        body = f"Taskul {task.title} a fost replanificat: {old_schedule} -> {new_schedule}."
    elif new_schedule:
        body = f"Taskul {task.title} a fost adăugat în calendar: {new_schedule}."
    else:
        body = f"Taskul {task.title} nu mai are interval planificat în calendar."
    body += f" Proiect: {project.title if project else 'proiect'}."
    create_notification(
        db,
        user_id=user_id,
        notification_type="TASK_REPLANNED",
        title=f"Calendar actualizat: {task.title}",
        body=body,
        project_id=task.project_id,
        task_id=task.id,
    )


def notify_project_message(db: Session, project_id: int, message_id: int, sender_id: int, sender_name: str | None, preview: str) -> None:
    project = db.query(Project).filter(Project.id == project_id).first()
    members = db.query(ProjectMember).filter(ProjectMember.project_id == project_id, ProjectMember.user_id != sender_id, ProjectMember.status == "ACTIVE").all()
    clean_preview = preview.strip()
    if len(clean_preview) > 160:
        clean_preview = clean_preview[:157] + "..."
    for member in members:
        create_notification(
            db,
            user_id=member.user_id,
            notification_type="PROJECT_MESSAGE",
            title=f"Mesaj nou în {project.title if project else 'proiect'}",
            body=f"{sender_name or 'Un membru'}: {clean_preview}",
            project_id=project_id,
            event_key=f"project:{project_id}:message:{message_id}:{member.user_id}",
        )


def notify_plan_problems(db: Session, project_id: int, problems: list[object]) -> None:
    if not problems:
        return

    project = db.query(Project).filter(Project.id == project_id).first()
    managers = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.role.in_(["OWNER", "ADMIN"]), ProjectMember.status == "ACTIVE")
        .all()
    )
    if not managers:
        return

    problem_keys = []
    for item in problems:
        task_id = getattr(item, "task_id", None)
        reason = getattr(item, "reason", None)
        if isinstance(item, dict):
            task_id = item.get("task_id", task_id)
            reason = item.get("reason", reason)
        problem_keys.append(f"{task_id}:{reason}")
    signature = hashlib.sha1("|".join(sorted(problem_keys)).encode("utf-8")).hexdigest()[:12]
    count = len(problems)
    title = f"Probleme în plan: {project.title if project else 'proiect'}"
    problem_label = "problemă" if count == 1 else "probleme"
    body = (
        f"Planul are {count} {problem_label}. "
        "Verifică tabul Probleme și rulează replanificarea dacă este necesar."
    )

    for manager in managers:
        create_notification(
            db,
            user_id=manager.user_id,
            notification_type="PLAN_PROBLEMS",
            title=title,
            body=body,
            project_id=project_id,
            event_key=f"project:{project_id}:plan-problems:{signature}:{manager.user_id}",
        )


def notify_plan_impact(
    db: Session,
    project_id: int,
    title: str,
    body: str,
    actor_id: int | None = None,
    task_id: int | None = None,
) -> None:
    managers = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.role.in_(["OWNER", "ADMIN"]), ProjectMember.status == "ACTIVE")
        .all()
    )
    for manager in managers:
        if actor_id is not None and manager.user_id == actor_id:
            continue
        create_notification(
            db,
            user_id=manager.user_id,
            notification_type="PLAN_IMPACT",
            title=title,
            body=body,
            project_id=project_id,
            task_id=task_id,
        )


def notify_availability_plan_impact(
    db: Session,
    project_id: int,
    changed_user_id: int,
    conflict_count: int,
    conflict_signature: str,
) -> None:
    if conflict_count <= 0:
        return

    project = db.query(Project).filter(Project.id == project_id).first()
    changed_user = db.query(User).filter(User.id == changed_user_id).first()
    member_name = changed_user.name or changed_user.email if changed_user else "Un membru"
    block_label = "bloc planificat" if conflict_count == 1 else "blocuri planificate"
    managers = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.role.in_(["OWNER", "ADMIN"]), ProjectMember.status == "ACTIVE")
        .all()
    )

    for manager in managers:
        create_notification(
            db,
            user_id=manager.user_id,
            notification_type="PLAN_IMPACT",
            title=f"Disponibilitate modificată: {project.title if project else 'proiect'}",
            body=(
                f"{member_name} și-a modificat disponibilitatea, iar {conflict_count} {block_label} "
                "nu mai respectă noul program. Verifică tabul Probleme și rulează Replanificare dacă este necesar."
            ),
            project_id=project_id,
            event_key=f"project:{project_id}:availability-impact:{changed_user_id}:{conflict_signature}",
        )


def notify_availability_replan_opportunity(
    db: Session,
    changed_user_id: int,
    change_signature: str,
) -> None:
    changed_user = db.query(User).filter(User.id == changed_user_id).first()
    member_name = changed_user.name or changed_user.email if changed_user else "Un membru"
    memberships = (
        db.query(ProjectMember)
        .filter(ProjectMember.user_id == changed_user_id, ProjectMember.status == "ACTIVE")
        .all()
    )

    for membership in memberships:
        active_task_count = (
            db.query(Task)
            .filter(
                Task.project_id == membership.project_id,
                Task.status.notin_(["CLOSED", "READY_TO_CLOSE"]),
            )
            .count()
        )
        if active_task_count <= 0:
            continue

        project = db.query(Project).filter(Project.id == membership.project_id).first()
        managers = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == membership.project_id,
                ProjectMember.role.in_(["OWNER", "ADMIN"]),
                ProjectMember.status == "ACTIVE",
            )
            .all()
        )

        for manager in managers:
            create_notification(
                db,
                user_id=manager.user_id,
                notification_type="PLAN_IMPACT",
                title=f"Disponibilitate actualizată: {project.title if project else 'proiect'}",
                body=(
                    f"{member_name} și-a modificat disponibilitatea. Nu există conflicte directe cu blocurile planificate, "
                    "dar planul poate fi regenerat sau replanificat pentru a folosi noul program disponibil."
                ),
                project_id=membership.project_id,
                event_key=f"project:{membership.project_id}:availability-opportunity:{changed_user_id}:{change_signature}:{manager.user_id}",
            )


def notify_member_inactive_replan_needed(db: Session, project_id: int, inactive_user_id: int) -> None:
    project = db.query(Project).filter(Project.id == project_id).first()
    inactive_user = db.query(User).filter(User.id == inactive_user_id).first()
    if not project or not inactive_user:
        return

    active_assignments = (
        db.query(TaskAssignment)
        .join(Task, Task.id == TaskAssignment.task_id)
        .filter(
            Task.project_id == project_id,
            Task.status.notin_(["CLOSED"]),
            TaskAssignment.user_id == inactive_user_id,
            TaskAssignment.member_status != "DONE",
        )
        .count()
    )
    if active_assignments <= 0:
        return

    managers = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.role.in_(["OWNER", "ADMIN"]),
            ProjectMember.status == "ACTIVE",
            ProjectMember.user_id != inactive_user_id,
        )
        .all()
    )
    if not managers:
        return

    member_name = inactive_user.name or inactive_user.email
    task_label = "task activ" if active_assignments == 1 else "taskuri active"
    for manager in managers:
        create_notification(
            db,
            user_id=manager.user_id,
            notification_type="MEMBER_INACTIVE_REPLAN",
            title=f"Membru inactiv în {project.title}",
            body=(
                f"Membrul {member_name} este inactiv și are {active_assignments} {task_label} nefinalizate. "
                "Verifică tabul Probleme și rulează replanificarea dacă este necesar."
            ),
            project_id=project_id,
            event_key=f"project:{project_id}:member-inactive:{inactive_user_id}:active-assignments:{active_assignments}",
        )


def notify_ready_to_close(db: Session, task: Task) -> None:
    project = db.query(Project).filter(Project.id == task.project_id).first()
    owners = db.query(ProjectMember).filter(ProjectMember.project_id == task.project_id, ProjectMember.role == "OWNER", ProjectMember.status == "ACTIVE").all()
    for owner in owners:
        create_notification(
            db,
            user_id=owner.user_id,
            notification_type="TASK_READY_TO_CLOSE",
            title=f"Task gata de închidere: {task.title}",
            body=f"Taskul {task.title} din proiectul {project.title if project else 'proiect'} este gata de verificare.",
            project_id=task.project_id,
            task_id=task.id,
            event_key=f"task:{task.id}:ready-to-close:{owner.user_id}",
        )


def notify_project_completed_if_needed(db: Session, project_id: int) -> None:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return
    tasks = db.query(Task).filter(Task.project_id == project_id).all()
    if not tasks or any(task.status != "CLOSED" for task in tasks):
        return
    members = db.query(ProjectMember).filter(ProjectMember.project_id == project_id, ProjectMember.status == "ACTIVE").all()
    for member in members:
        create_notification(
            db,
            user_id=member.user_id,
            notification_type="PROJECT_COMPLETED",
            title=f"Proiect finalizat: {project.title}",
            body=f"Toate taskurile din proiectul {project.title} sunt închise.",
            project_id=project_id,
            event_key=f"project:{project_id}:completed:{member.user_id}",
        )


def send_deadline_reminders(db: Session) -> int:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    assignments = (
        db.query(TaskAssignment, Task, Project)
        .join(Task, Task.id == TaskAssignment.task_id)
        .join(Project, Project.id == Task.project_id)
        .join(ProjectMember, (ProjectMember.project_id == Task.project_id) & (ProjectMember.user_id == TaskAssignment.user_id))
        .filter(TaskAssignment.member_status != "DONE", Task.status.notin_(["READY_TO_CLOSE", "CLOSED"]), Task.deadline > now)
        .filter(ProjectMember.status == "ACTIVE")
        .all()
    )
    count = 0
    for assignment, task, project in assignments:
        prefs = get_or_create_preferences(db, assignment.user_id)
        if not prefs.deadline_reminders_enabled:
            continue
        due_hours = [
            hours
            for hours in parse_hours(prefs.deadline_reminder_hours)
            if task.deadline - timedelta(hours=hours) <= now < task.deadline
        ]
        if not due_hours:
            continue

        hours = min(due_hours)
        created = create_notification(
            db,
            user_id=assignment.user_id,
            notification_type="DEADLINE_REMINDER",
            title=f"Deadline în {hours}h: {task.title}",
            body=f"Taskul {task.title} din proiectul {project.title} are deadline la {task.deadline}.",
            project_id=task.project_id,
            task_id=task.id,
            event_key=f"task:{task.id}:deadline:{task.deadline.isoformat()}:{hours}h:{assignment.user_id}",
            email=True,
        )
        if created:
            count += 1
    return count


def send_scheduled_block_reminders(db: Session) -> int:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    horizon = now + timedelta(hours=24)
    rows = (
        db.query(ScheduledBlock, TaskAssignment, Task, Project)
        .join(Task, Task.id == ScheduledBlock.task_id)
        .join(Project, Project.id == ScheduledBlock.project_id)
        .join(
            TaskAssignment,
            (TaskAssignment.task_id == ScheduledBlock.task_id)
            & (TaskAssignment.user_id == ScheduledBlock.user_id),
        )
        .join(
            ProjectMember,
            (ProjectMember.project_id == ScheduledBlock.project_id)
            & (ProjectMember.user_id == ScheduledBlock.user_id),
        )
        .filter(
            ScheduledBlock.block_status == "PLANNED",
            ScheduledBlock.start_datetime > now,
            ScheduledBlock.start_datetime <= horizon,
            TaskAssignment.member_status != "DONE",
            Task.status.notin_(["READY_TO_CLOSE", "CLOSED"]),
            ProjectMember.status == "ACTIVE",
        )
        .all()
    )

    count = 0
    for block, assignment, task, project in rows:
        prefs = get_or_create_preferences(db, assignment.user_id)
        if not prefs.scheduled_block_reminders_enabled:
            continue

        due_minutes = [
            minutes
            for minutes in parse_minutes(prefs.scheduled_block_reminder_minutes)
            if block.start_datetime - timedelta(minutes=minutes) <= now < block.start_datetime
        ]
        if not due_minutes:
            continue

        minutes = min(due_minutes)
        label = f"{minutes} min" if minutes < 60 else f"{minutes // 60}h" if minutes % 60 == 0 else f"{minutes} min"
        created = create_notification(
            db,
            user_id=assignment.user_id,
            notification_type="SCHEDULED_BLOCK_REMINDER",
            title=f"Task planificat în {label}: {task.title}",
            body=(
                f"Taskul {task.title} din proiectul {project.title} este planificat "
                f"între {block.start_datetime} și {block.end_datetime}."
            ),
            project_id=task.project_id,
            task_id=task.id,
            event_key=f"block:{block.id}:schedule:{block.start_datetime.isoformat()}:{minutes}min:{assignment.user_id}",
            email=True,
        )
        if created:
            count += 1
    return count


def send_missed_planned_work_notifications(db: Session) -> int:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = (
        db.query(ScheduledBlock, TaskAssignment, Task, Project)
        .join(Task, Task.id == ScheduledBlock.task_id)
        .join(Project, Project.id == ScheduledBlock.project_id)
        .join(
            TaskAssignment,
            (TaskAssignment.task_id == ScheduledBlock.task_id)
            & (TaskAssignment.user_id == ScheduledBlock.user_id),
        )
        .join(
            ProjectMember,
            (ProjectMember.project_id == ScheduledBlock.project_id)
            & (ProjectMember.user_id == ScheduledBlock.user_id),
        )
        .filter(
            ScheduledBlock.block_status == "PLANNED",
            ScheduledBlock.end_datetime < now,
            TaskAssignment.member_status != "DONE",
            Task.status.notin_(["READY_TO_CLOSE", "CLOSED"]),
            ProjectMember.status == "ACTIVE",
        )
        .all()
    )

    count = 0
    for block, assignment, task, project in rows:
        created = create_notification(
            db,
            user_id=assignment.user_id,
            notification_type="MISSED_PLANNED_WORK",
            title=f"Bloc planificat nefinalizat: {task.title}",
            body=(
                f"Taskul {task.title} din proiectul {project.title} avea un bloc planificat "
                f"între {block.start_datetime} și {block.end_datetime}, dar nu a fost marcat ca finalizat."
            ),
            project_id=task.project_id,
            task_id=task.id,
            event_key=f"block:{block.id}:missed:{assignment.user_id}",
            email=False,
        )
        if created:
            count += 1

        managers = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == task.project_id,
                ProjectMember.role.in_(["OWNER", "ADMIN"]),
                ProjectMember.status == "ACTIVE",
                ProjectMember.user_id != assignment.user_id,
            )
            .all()
        )
        for manager in managers:
            created = create_notification(
                db,
                user_id=manager.user_id,
                notification_type="MISSED_PLANNED_WORK",
                title=f"Bloc planificat nefinalizat: {task.title}",
                body=(
                    f"Taskul {task.title} din proiectul {project.title} avea un bloc planificat "
                    f"între {block.start_datetime} și {block.end_datetime}. Verifică tabul Probleme și rulează replanificarea dacă este necesar."
                ),
                project_id=task.project_id,
                task_id=task.id,
                event_key=f"block:{block.id}:missed:manager:{manager.user_id}",
                email=False,
            )
            if created:
                count += 1

    return count
