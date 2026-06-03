from datetime import datetime, timedelta, timezone
import hashlib

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.notification import Notification, NotificationDeliveryLog, NotificationPreference
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
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
    if notification_type == "PROJECT_MEMBER_ADDED":
        return prefs.project_events_enabled
    if notification_type == "TASK_ASSIGNED":
        return prefs.assignment_events_enabled
    if notification_type == "PROJECT_MESSAGE":
        return prefs.message_events_enabled
    if notification_type == "TASK_READY_TO_CLOSE":
        return prefs.ready_to_close_enabled
    if notification_type == "PROJECT_COMPLETED":
        return prefs.project_completed_enabled
    if notification_type == "DEADLINE_REMINDER":
        return prefs.deadline_reminders_enabled
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
        title=f"Ai fost adaugat in proiectul {project.title}",
        body=f"{actor_name or 'Un owner'} te-a adaugat in proiectul {project.title}.",
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
        body=f"Ai primit un task in proiectul {project.title if project else 'proiect'} cu deadline {task.deadline}.",
        project_id=task.project_id,
        task_id=task.id,
        event_key=f"task:{task.id}:assigned:{user_id}",
    )


def notify_project_message(db: Session, project_id: int, message_id: int, sender_id: int, sender_name: str | None, preview: str) -> None:
    project = db.query(Project).filter(Project.id == project_id).first()
    members = db.query(ProjectMember).filter(ProjectMember.project_id == project_id, ProjectMember.user_id != sender_id).all()
    clean_preview = preview.strip()
    if len(clean_preview) > 160:
        clean_preview = clean_preview[:157] + "..."
    for member in members:
        create_notification(
            db,
            user_id=member.user_id,
            notification_type="PROJECT_MESSAGE",
            title=f"Mesaj nou in {project.title if project else 'proiect'}",
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
        .filter(ProjectMember.project_id == project_id, ProjectMember.role.in_(["OWNER", "ADMIN"]))
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
    title = f"Probleme in plan: {project.title if project else 'proiect'}"
    problem_label = "problema" if count == 1 else "probleme"
    body = (
        f"Planul are {count} {problem_label}. "
        "Verifica tabul Problems si ruleaza Replanificare daca este necesar."
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


def notify_ready_to_close(db: Session, task: Task) -> None:
    project = db.query(Project).filter(Project.id == task.project_id).first()
    owners = db.query(ProjectMember).filter(ProjectMember.project_id == task.project_id, ProjectMember.role == "OWNER").all()
    for owner in owners:
        create_notification(
            db,
            user_id=owner.user_id,
            notification_type="TASK_READY_TO_CLOSE",
            title=f"Task gata de inchidere: {task.title}",
            body=f"Taskul {task.title} din proiectul {project.title if project else 'proiect'} este READY_TO_CLOSE.",
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
    members = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
    for member in members:
        create_notification(
            db,
            user_id=member.user_id,
            notification_type="PROJECT_COMPLETED",
            title=f"Proiect finalizat: {project.title}",
            body=f"Toate taskurile din proiectul {project.title} sunt inchise.",
            project_id=project_id,
            event_key=f"project:{project_id}:completed:{member.user_id}",
        )


def send_deadline_reminders(db: Session) -> int:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    assignments = (
        db.query(TaskAssignment, Task, Project)
        .join(Task, Task.id == TaskAssignment.task_id)
        .join(Project, Project.id == Task.project_id)
        .filter(TaskAssignment.member_status != "DONE", Task.status != "CLOSED", Task.deadline > now)
        .all()
    )
    count = 0
    for assignment, task, project in assignments:
        prefs = get_or_create_preferences(db, assignment.user_id)
        if not prefs.deadline_reminders_enabled:
            continue
        for hours in parse_hours(prefs.deadline_reminder_hours):
            starts_at = task.deadline - timedelta(hours=hours)
            ends_at = starts_at + timedelta(minutes=10)
            if starts_at <= now < ends_at:
                created = create_notification(
                    db,
                    user_id=assignment.user_id,
                    notification_type="DEADLINE_REMINDER",
                    title=f"Deadline in {hours}h: {task.title}",
                    body=f"Taskul {task.title} din proiectul {project.title} are deadline la {task.deadline}.",
                    project_id=task.project_id,
                    task_id=task.id,
                    event_key=f"task:{task.id}:deadline:{hours}h:{assignment.user_id}",
                    email=True,
                )
                if created:
                    count += 1
    return count
