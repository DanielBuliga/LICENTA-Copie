from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)


class UserPublic(BaseModel):
    id: int
    name: str
    email: EmailStr
    status: str = "ACTIVE"
    created_at: datetime

    class Config:
        from_attributes = True  # allow reading from SQLAlchemy model
