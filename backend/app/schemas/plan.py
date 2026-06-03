from datetime import datetime
from pydantic import BaseModel


class ScheduledBlockPublic(BaseModel):
    id: int
    project_id: int
    task_id: int
    user_id: int
    start_datetime: datetime
    end_datetime: datetime
    planned_minutes: int
    block_status: str

    class Config:
        from_attributes = True


class BlockStatusUpdate(BaseModel):
    block_status: str  # PLANNED / DONE / SKIPPED