from datetime import datetime
from pydantic import BaseModel


class ProblemItem(BaseModel):
    task_id: int
    task_title: str | None = None
    type: str          # AT_RISK / BLOCKED / NO_SKILLS
    reason: str
    deadline: datetime


class ProblemsResponse(BaseModel):
    problems: list[ProblemItem]
