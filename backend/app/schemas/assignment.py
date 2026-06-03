from pydantic import BaseModel, Field


class AssignmentCreate(BaseModel):
    user_id: int
    assigned_minutes: int | None = Field(default=None, ge=1)


class AssignmentUpdate(BaseModel):
    member_status: str  # TODO / IN_PROGRESS / DONE


class AssignmentPublic(BaseModel):
    id: int
    task_id: int
    user_id: int
    assigned_minutes: int | None
    member_status: str

    class Config:
        from_attributes = True