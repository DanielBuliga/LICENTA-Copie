from datetime import datetime
from pydantic import BaseModel


class ProblemItem(BaseModel):
    task_id: int
    task_title: str | None = None
    task_path: str | None = None
    type: str          # primary type
    types: list[str] | None = None
    reason: str
    reasons: list[str] | None = None
    deadline: datetime


class ProblemsResponse(BaseModel):
    problems: list[ProblemItem]
