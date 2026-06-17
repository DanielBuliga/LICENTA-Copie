from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.users import router as users_router
from app.api.routes.projects import router as projects_router
from app.api.routes.tasks import router as tasks_router
from app.api.routes.dependencies import router as dependencies_router
from app.api.routes.skills import router as skills_router
from app.api.routes.user_skills import router as user_skills_router
from app.api.routes.task_skills import router as task_skills_router
from app.api.routes.assignments import router as assignments_router
from app.api.routes.availability import router as availability_router
from app.api.routes.plan import router as plan_router
from app.api.routes.plan_generate import router as plan_generate_router
from app.api.routes.problems import router as problems_router
from app.api.routes.plan_export_ics import router as plan_export_ics_router
from app.api.routes.documents import router as documents_router
from app.api.routes.messages import router as messages_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.activity import router as activity_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(projects_router)
api_router.include_router(tasks_router)
api_router.include_router(dependencies_router)
api_router.include_router(skills_router)
api_router.include_router(user_skills_router)
api_router.include_router(task_skills_router)
api_router.include_router(assignments_router)
api_router.include_router(availability_router)
api_router.include_router(plan_router)
api_router.include_router(plan_generate_router)
api_router.include_router(problems_router)
api_router.include_router(plan_export_ics_router)
api_router.include_router(documents_router)
api_router.include_router(messages_router)
api_router.include_router(notifications_router)
api_router.include_router(activity_router)
