from datetime import datetime, timezone
from email.message import EmailMessage
import smtplib

from sqlalchemy.orm import Session

from app.core.config import SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USE_TLS, SMTP_USER
from app.models.notification import Notification
from app.models.user import User


def email_configured() -> bool:
    return bool(SMTP_HOST and SMTP_FROM)


def send_notification_email(db: Session, user_id: int, notification: Notification) -> bool:
    if not email_configured():
        return False

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.email:
        return False

    message = EmailMessage()
    message["Subject"] = notification.title
    message["From"] = SMTP_FROM
    message["To"] = user.email
    message.set_content(f"{notification.body}\n\nSmart Planner")

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
        if SMTP_USE_TLS:
            smtp.starttls()
        if SMTP_USER:
            smtp.login(SMTP_USER, SMTP_PASSWORD)
        smtp.send_message(message)

    notification.email_sent_at = datetime.now(timezone.utc)
    db.add(notification)
    db.commit()
    return True
