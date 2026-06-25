from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class NotificationPublic(BaseModel):
    id: int
    user_id: int
    type: str
    title: str
    body: str
    project_id: int | None
    task_id: int | None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationPreferencePublic(BaseModel):
    in_app_enabled: bool
    email_enabled: bool
    deadline_reminders_enabled: bool
    deadline_reminder_hours: list[int]
    scheduled_block_reminders_enabled: bool
    scheduled_block_reminder_minutes: list[int]
    project_events_enabled: bool
    assignment_events_enabled: bool
    message_events_enabled: bool
    ready_to_close_enabled: bool
    project_completed_enabled: bool


class NotificationPreferenceUpdate(BaseModel):
    in_app_enabled: bool | None = None
    email_enabled: bool | None = None
    deadline_reminders_enabled: bool | None = None
    deadline_reminder_hours: list[int] | None = Field(default=None, max_length=8)
    scheduled_block_reminders_enabled: bool | None = None
    scheduled_block_reminder_minutes: list[int] | None = Field(default=None, max_length=8)
    project_events_enabled: bool | None = None
    assignment_events_enabled: bool | None = None
    message_events_enabled: bool | None = None
    ready_to_close_enabled: bool | None = None
    project_completed_enabled: bool | None = None

    @field_validator("deadline_reminder_hours")
    @classmethod
    def validate_hours(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return value
        unique = sorted(set(value), reverse=True)
        if any(hour < 1 or hour > 24 * 30 for hour in unique):
            raise ValueError("Reminder intervals must be between 1 hour and 30 days")
        return unique

    @field_validator("scheduled_block_reminder_minutes")
    @classmethod
    def validate_minutes(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return value
        unique = sorted(set(value), reverse=True)
        if any(minutes < 1 or minutes > 24 * 60 for minutes in unique):
            raise ValueError("Reminder intervals must be between 1 minute and 24 hours")
        return unique


class UnreadCount(BaseModel):
    unread: int
