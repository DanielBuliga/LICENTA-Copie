from pydantic import BaseModel, EmailStr, Field


class MemberAddRequest(BaseModel):
    email: EmailStr
    role: str = Field(default="MEMBER")


class MemberRoleUpdate(BaseModel):
    role: str


class ProjectMemberOut(BaseModel):
    user_id: int
    role: str

    class Config:
        from_attributes = True