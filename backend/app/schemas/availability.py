from datetime import date, time
from pydantic import BaseModel, Field


class WindowItem(BaseModel):
    weekday: int = Field(ge=0, le=6)
    start_time: time
    end_time: time


class WindowsUpdate(BaseModel):
    windows: list[WindowItem]


class OverrideItem(BaseModel):
    day: date
    is_unavailable: bool = False
    start_time: time | None = None
    end_time: time | None = None


class OverridesUpdate(BaseModel):
    overrides: list[OverrideItem]