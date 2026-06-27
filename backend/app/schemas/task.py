from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    parent_task_id: int | None = None

    priority: int = Field(default=3, ge=1, le=5)
    estimate_minutes: int = Field(ge=1)

    # ISO 8601 datetime string will be parsed automatically
    deadline: datetime


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    parent_task_id: int | None = None

    priority: int | None = Field(default=None, ge=1, le=5)
    estimate_minutes: int | None = Field(default=None, ge=1)

    deadline: datetime | None = None
    status: Literal["OPEN", "IN_PROGRESS", "READY_TO_CLOSE", "CLOSED"] | None = None


class TaskPublic(BaseModel):
    id: int
    project_id: int
    title: str
    description: str | None
    parent_task_id: int | None
    priority: int
    estimate_minutes: int
    deadline: datetime
    status: str
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MyTaskPublic(TaskPublic):
    project_title: str
    parent_task_title: str | None = None
    member_status: str
    assigned_minutes: int | None = None
