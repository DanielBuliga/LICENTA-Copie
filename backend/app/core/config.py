import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

DB_URL = os.getenv("DB_URL", "")
JWT_SECRET = os.getenv("JWT_SECRET", "")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
    ).split(",")
    if origin.strip()
]
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "smart-planner@local")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
NOTIFICATION_WORKER_ENABLED = os.getenv("NOTIFICATION_WORKER_ENABLED", "true").lower() == "true"
NOTIFICATION_WORKER_INTERVAL_SECONDS = int(os.getenv("NOTIFICATION_WORKER_INTERVAL_SECONDS", "600"))

# JWT settings (simple)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

if not JWT_SECRET or JWT_SECRET in {"change_me", "change_me_later"} or len(JWT_SECRET) < 32:
    raise RuntimeError("JWT_SECRET trebuie setat în .env și trebuie să aibă cel puțin 32 de caractere.")
