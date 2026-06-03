from datetime import datetime
from sqlalchemy.orm import Session

from app.models.scheduled_block import ScheduledBlock
from app.models.task_assignment import TaskAssignment
from app.utils.time_utils import utc_naive


def list_blocks(
    db: Session,
    project_id: int,
    date_from: datetime,
    date_to: datetime,
    user_id: int | None = None,
) -> list[ScheduledBlock]:
    date_from = utc_naive(date_from)
    date_to = utc_naive(date_to)

    q = db.query(ScheduledBlock).join(
        TaskAssignment,
        (TaskAssignment.task_id == ScheduledBlock.task_id)
        & (TaskAssignment.user_id == ScheduledBlock.user_id),
    ).filter(
        ScheduledBlock.project_id == project_id,
        ScheduledBlock.start_datetime >= date_from,
        ScheduledBlock.start_datetime < date_to,
    )

    if user_id is not None:
        q = q.filter(ScheduledBlock.user_id == user_id)

    return q.order_by(ScheduledBlock.start_datetime.asc()).all()


def get_block(db: Session, block_id: int) -> ScheduledBlock | None:
    return db.query(ScheduledBlock).filter(ScheduledBlock.id == block_id).first()
