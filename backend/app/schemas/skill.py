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


class SkillAliasCreate(BaseModel):
    alias: str = Field(min_length=1, max_length=120)


class SkillAliasPublic(BaseModel):
    id: int
    skill_id: int
    alias: str

    class Config:
        from_attributes = True


class UserSkillItem(BaseModel):
    skill_id: int


class UserSkillsUpdate(BaseModel):
    skills: list[UserSkillItem]


class TaskSkillItem(BaseModel):
    skill_id: int


class TaskSkillsUpdate(BaseModel):
    skills: list[TaskSkillItem]


class TaskSkillSuggestion(BaseModel):
    skill_id: int
    name: str
    confidence: float
    reason: str
    matched_term: str | None = None


class TaskSkillExtractionResponse(BaseModel):
    task_id: int
    document_count: int
    applied: bool = False
    suggestions: list[TaskSkillSuggestion]


class UserSkillAdd(BaseModel):
    skill_id: int


class UserSkillPublic(BaseModel):
    skill_id: int


class MemberSkillPublic(UserSkillPublic):
    user_id: int
    user_name: str | None = None
    user_email: str | None = None
