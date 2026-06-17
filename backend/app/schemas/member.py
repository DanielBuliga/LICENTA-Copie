from pydantic import BaseModel, EmailStr, Field


class MemberAddRequest(BaseModel):
    email: EmailStr
    role: str = Field(default="MEMBER")


class MemberRoleUpdate(BaseModel):
    role: str


class MemberStatusUpdate(BaseModel):
    status: str
    reason: str | None = None


class MemberRemoveResponse(BaseModel):
    action: str
    status: str | None = None
    message: str


class ProjectMemberOut(BaseModel):
    user_id: int
    role: str
    status: str = "ACTIVE"

    class Config:
        from_attributes = True
