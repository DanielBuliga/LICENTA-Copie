from datetime import datetime
from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    title: str
    description: str | None = None


class ProjectPublic(BaseModel):
    id: int
    title: str
    description: str | None
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectListItem(BaseModel):
    id: int
    title: str
    description: str | None
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectMemberPublic(BaseModel):
    user_id: int
    name: str | None = None
    email: str | None = None
    role: str
    joined_at: datetime

    class Config:
        from_attributes = True


class ProjectUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
