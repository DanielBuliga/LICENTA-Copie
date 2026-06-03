from datetime import date
from pydantic import BaseModel, Field


class ReplanRequest(BaseModel):
    today: date
    horizon_days: int = Field(default=7, ge=1, le=30)