import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import CORS_ORIGINS, NOTIFICATION_WORKER_ENABLED
from app.services.notification_worker import deadline_notification_loop

deadline_worker_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global deadline_worker_task
    if NOTIFICATION_WORKER_ENABLED and deadline_worker_task is None:
        deadline_worker_task = asyncio.create_task(deadline_notification_loop())

    try:
        yield
    finally:
        if deadline_worker_task is not None:
            deadline_worker_task.cancel()
            try:
                await deadline_worker_task
            except asyncio.CancelledError:
                pass
            deadline_worker_task = None


app = FastAPI(title="Licenta SmartPlanner API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(api_router)
