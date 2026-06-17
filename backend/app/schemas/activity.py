from datetime import datetime

from pydantic import BaseModel


class ProjectActivityPublic(BaseModel):
    id: int
    project_id: int
    actor_id: int | None
    actor_name: str | None = None
    actor_email: str | None = None
    event_type: str
    entity_type: str | None
    entity_id: int | None
    title: str
    details: str | None
    created_at: datetime

    class Config:
        from_attributes = True
