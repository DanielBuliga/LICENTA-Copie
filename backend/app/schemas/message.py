from datetime import datetime

from pydantic import BaseModel, Field


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class MessagePublic(BaseModel):
    id: int
    project_id: int
    sender_id: int
    sender_name: str | None = None
    sender_email: str | None = None
    content: str
    created_at: datetime

    class Config:
        from_attributes = True
