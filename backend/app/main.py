import asyncio

from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import NOTIFICATION_WORKER_ENABLED
from app.services.notification_worker import deadline_notification_loop

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Licenta Planner API")

deadline_worker_task: asyncio.Task | None = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
       "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.on_event("startup")
async def start_notification_worker():
    global deadline_worker_task
    if NOTIFICATION_WORKER_ENABLED and deadline_worker_task is None:
        deadline_worker_task = asyncio.create_task(deadline_notification_loop())


@app.on_event("shutdown")
async def stop_notification_worker():
    global deadline_worker_task
    if deadline_worker_task is not None:
        deadline_worker_task.cancel()
        deadline_worker_task = None

app.include_router(api_router)