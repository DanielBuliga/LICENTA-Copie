from datetime import datetime

from pydantic import BaseModel, Field


class DocumentCreate(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)
    file_url: str | None = Field(default=None, max_length=500)
    description: str | None = None
    task_id: int | None = None


class DocumentPublic(BaseModel):
    id: int
    project_id: int
    task_id: int | None
    uploaded_by: int
    file_name: str
    file_url: str | None
    description: str | None
    created_at: datetime

    class Config:
        from_attributes = True
