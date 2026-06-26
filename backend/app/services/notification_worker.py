import asyncio
import logging
from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.services.notification_service import (
    send_deadline_reminders,
    send_missed_planned_work_notifications,
    send_scheduled_block_reminders,
)

logger = logging.getLogger(__name__)


def _run_deadline_reminders_sync() -> None:
    db = SessionLocal()
    try:
        created_count = (
            send_deadline_reminders(db)
            + send_scheduled_block_reminders(db)
            + send_missed_planned_work_notifications(db)
        )
        if created_count:
            logger.info("Notification reminder worker created %s notifications.", created_count)
    except Exception:
        logger.exception("Deadline reminder worker failed.")
    finally:
        db.close()


def _seconds_until_next_minute() -> float:
    now = datetime.now(timezone.utc)
    return 60 - now.second - (now.microsecond / 1_000_000)


async def deadline_notification_loop() -> None:
    logger.info("Deadline reminder worker started.")
    while True:
        try:
            await asyncio.sleep(_seconds_until_next_minute() + 0.1)
            await asyncio.to_thread(_run_deadline_reminders_sync)
        except asyncio.CancelledError:
            logger.info("Deadline reminder worker stopped.")
            break
        except Exception:
            logger.exception("Deadline reminder worker loop failed.")
            await asyncio.sleep(10)
