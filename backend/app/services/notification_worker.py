import asyncio

from app.core.config import NOTIFICATION_WORKER_INTERVAL_SECONDS
from app.db.session import SessionLocal
from app.services.notification_service import send_deadline_reminders


async def deadline_notification_loop() -> None:
    while True:
        db = SessionLocal()
        try:
            send_deadline_reminders(db)
        finally:
            db.close()
        await asyncio.sleep(NOTIFICATION_WORKER_INTERVAL_SECONDS)
