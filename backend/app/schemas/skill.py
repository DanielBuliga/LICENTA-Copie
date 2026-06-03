from pydantic import BaseModel, Field


class SkillCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class SkillUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class SkillPublic(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class UserSkillItem(BaseModel):
    skill_id: int
    level: int = Field(ge=1, le=5)


class UserSkillsUpdate(BaseModel):
    skills: list[UserSkillItem]


class TaskSkillItem(BaseModel):
    skill_id: int
    min_level: int = Field(default=1, ge=1, le=5)


class TaskSkillsUpdate(BaseModel):
    skills: list[TaskSkillItem]


class TaskSkillSuggestion(BaseModel):
    skill_id: int
    name: str
    min_level: int = Field(ge=1, le=5)
    confidence: float
    reason: str


class TaskSkillExtractionResponse(BaseModel):
    task_id: int
    document_count: int
    applied: bool = False
    suggestions: list[TaskSkillSuggestion]


class UserSkillAdd(BaseModel):
    skill_id: int
    level: int = Field(default=1, ge=1, le=5)


class UserSkillUpdate(BaseModel):
    level: int = Field(ge=1, le=5)


class UserSkillPublic(BaseModel):
    skill_id: int
    level: int
    validation_status: str = "PENDING"
    validated_by: int | None = None


class MemberSkillPublic(UserSkillPublic):
    user_id: int
    user_name: str | None = None
    user_email: str | None = None


class MemberSkillValidationUpdate(BaseModel):
    level: int | None = Field(default=None, ge=1, le=5)
    validation_status: str = Field(pattern="^(PENDING|VALIDATED|ADJUSTED)$")
