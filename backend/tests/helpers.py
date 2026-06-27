from dataclasses import dataclass
from datetime import date, datetime, time
from pathlib import Path
import importlib.util
import sys
import types

BASE_DIR = Path(__file__).resolve().parents[1]


def _ensure_package(name: str) -> types.ModuleType:
    module = sys.modules.get(name)
    if module is None:
        module = types.ModuleType(name)
        module.__path__ = []
        sys.modules[name] = module
    return module


def _register_module(name: str, **attrs) -> types.ModuleType:
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    sys.modules[name] = module
    return module


def load_module(name: str, relative_path: str):
    spec = importlib.util.spec_from_file_location(name, BASE_DIR / relative_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load test module: {relative_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class _Session:
    pass


class _ColumnStub:
    def __eq__(self, other):
        return ("eq", other)

    def __ge__(self, other):
        return ("ge", other)

    def __lt__(self, other):
        return ("lt", other)

    def __gt__(self, other):
        return ("gt", other)


@dataclass
class TaskStub:
    id: int
    project_id: int
    title: str
    description: str | None
    parent_task_id: int | None
    priority: int
    estimate_minutes: int
    deadline: datetime
    status: str
    created_by: int


@dataclass
class SkillStub:
    id: int
    name: str


@dataclass
class SkillAliasStub:
    skill_id: int
    alias: str


@dataclass
class ProjectDocumentStub:
    id: int
    project_id: int
    task_id: int | None
    file_name: str
    description: str | None = None


@dataclass
class TaskAssignmentStub:
    task_id: int
    user_id: int
    member_status: str = "TODO"
    assigned_minutes: int | None = None
    assignment_source: str = "MANUAL"


class ScheduledBlockStub:
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


@dataclass
class AvailabilityWindowStub:
    user_id: int
    weekday: int
    start_time: time
    end_time: time


@dataclass
class AvailabilityOverrideStub:
    user_id: int
    day: date
    is_unavailable: bool = False
    start_time: time | None = None
    end_time: time | None = None


AvailabilityWindowStub.user_id = _ColumnStub()
AvailabilityOverrideStub.user_id = _ColumnStub()
AvailabilityOverrideStub.day = _ColumnStub()
ScheduledBlockStub.user_id = _ColumnStub()
ScheduledBlockStub.task_id = _ColumnStub()
ScheduledBlockStub.start_datetime = _ColumnStub()
ScheduledBlockStub.end_datetime = _ColumnStub()
SkillAliasStub.skill_id = _ColumnStub()
ProjectDocumentStub.project_id = _ColumnStub()
ProjectDocumentStub.task_id = _ColumnStub()
TaskAssignmentStub.task_id = _ColumnStub()


def install_unit_test_stubs() -> None:
    _ensure_package("sqlalchemy")
    _register_module("sqlalchemy.orm", Session=_Session)

    _ensure_package("app")
    _ensure_package("app.models")
    _ensure_package("app.services")
    _ensure_package("app.utils")
    _ensure_package("app.core")

    _register_module("app.models.task", Task=TaskStub)
    _register_module("app.models.scheduled_block", ScheduledBlock=ScheduledBlockStub)
    _register_module("app.models.availability_window", AvailabilityWindow=AvailabilityWindowStub)
    _register_module("app.models.availability_override", AvailabilityOverride=AvailabilityOverrideStub)
    _register_module("app.models.skill", Skill=SkillStub)
    _register_module("app.models.skill_alias", SkillAlias=SkillAliasStub)
    _register_module("app.models.project_document", ProjectDocument=ProjectDocumentStub)
    _register_module("app.models.task_assignment", TaskAssignment=TaskAssignmentStub)
    _register_module("app.core.config", UPLOAD_DIR="uploads")
    _register_module("app.services.skills_service", list_skills=lambda db: getattr(db, "skills", []))
    _register_module("app.services.assignments_service", list_assignments=lambda db, task_id: getattr(db, "assignments", []))
    _register_module("app.services.activity_service", log_project_activity=lambda *args, **kwargs: None)
    _register_module("app.services.notification_service", notify_ready_to_close=lambda *args, **kwargs: None)
    _register_module("app.services.tasks_service", recompute_parent_status_chain=lambda *args, **kwargs: None)

    if "app.utils.time_utils" not in sys.modules:
        load_module("app.utils.time_utils", "app/utils/time_utils.py")


def load_service_module(name: str, relative_path: str):
    install_unit_test_stubs()
    return load_module(name, relative_path)
