from pydantic import BaseModel


class DependencyCreate(BaseModel):
    predecessor_task_id: int
    successor_task_id: int


class DependencyPublic(BaseModel):
    id: int
    project_id: int
    predecessor_task_id: int
    successor_task_id: int

    class Config:
        from_attributes = True