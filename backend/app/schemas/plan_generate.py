from datetime import date
from pydantic import BaseModel, Field


class PlanGenerateRequest(BaseModel):
    start_day: date
    horizon_days: int = Field(default=7, ge=1, le=30)


class AtRiskItem(BaseModel):
    task_id: int
    reason: str


class PlanGenerateResponse(BaseModel):
    blocks_created: int
    blocks_removed: int = 0
    blocks_preserved: int = 0
    assignments_created: int = 0
    assignments_preserved: int = 0
    at_risk: list[AtRiskItem]
