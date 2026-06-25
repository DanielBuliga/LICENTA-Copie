from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_deps import get_current_user
from app.core.deps import get_db
from app.models.notification import Notification
from app.schemas.notification import NotificationPreferencePublic, NotificationPreferenceUpdate, NotificationPublic, UnreadCount
from app.services.notification_service import format_hours, format_minutes, get_or_create_preferences, parse_hours, parse_minutes

router = APIRouter(tags=["notifications"])


def prefs_to_public(prefs) -> NotificationPreferencePublic:
    return NotificationPreferencePublic(
        in_app_enabled=prefs.in_app_enabled,
        email_enabled=prefs.email_enabled,
        deadline_reminders_enabled=prefs.deadline_reminders_enabled,
        deadline_reminder_hours=parse_hours(prefs.deadline_reminder_hours),
        scheduled_block_reminders_enabled=prefs.scheduled_block_reminders_enabled,
        scheduled_block_reminder_minutes=parse_minutes(prefs.scheduled_block_reminder_minutes),
        project_events_enabled=prefs.project_events_enabled,
        assignment_events_enabled=prefs.assignment_events_enabled,
        message_events_enabled=prefs.message_events_enabled,
        ready_to_close_enabled=prefs.ready_to_close_enabled,
        project_completed_enabled=prefs.project_completed_enabled,
    )


@router.get("/notifications", response_model=list[NotificationPublic])
def list_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.is_read == False)  # noqa: E712
    return query.order_by(Notification.created_at.desc()).limit(50).all()


@router.get("/notifications/unread-count", response_model=UnreadCount)
def unread_count(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    count = db.query(Notification).filter(Notification.user_id == current_user.id, Notification.is_read == False).count()  # noqa: E712
    return UnreadCount(unread=count)


@router.patch("/notifications/{notification_id}/read", response_model=NotificationPublic)
def mark_read(notification_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    row = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    row.is_read = True
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/notifications/mark-all-read", response_model=UnreadCount)
def mark_all_read(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db.query(Notification).filter(Notification.user_id == current_user.id, Notification.is_read == False).update({"is_read": True})  # noqa: E712
    db.commit()
    return UnreadCount(unread=0)


@router.get("/users/me/notification-preferences", response_model=NotificationPreferencePublic)
def get_notification_preferences(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return prefs_to_public(get_or_create_preferences(db, current_user.id))


@router.patch("/users/me/notification-preferences", response_model=NotificationPreferencePublic)
def update_notification_preferences(
    payload: NotificationPreferenceUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    prefs = get_or_create_preferences(db, current_user.id)
    data = payload.model_dump(exclude_unset=True)
    if "deadline_reminder_hours" in data and data["deadline_reminder_hours"] is not None:
        prefs.deadline_reminder_hours = format_hours(data.pop("deadline_reminder_hours"))
    if "scheduled_block_reminder_minutes" in data and data["scheduled_block_reminder_minutes"] is not None:
        prefs.scheduled_block_reminder_minutes = format_minutes(data.pop("scheduled_block_reminder_minutes"))
    for key, value in data.items():
        setattr(prefs, key, value)
    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return prefs_to_public(prefs)
