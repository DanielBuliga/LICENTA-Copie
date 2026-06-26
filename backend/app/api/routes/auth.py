from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi import Request
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.schemas.user import UserCreate, UserPublic
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.users_service import get_user_by_email, create_user

router = APIRouter(prefix="/auth", tags=["auth"])

RATE_LIMIT_WINDOW_SECONDS = 60
MAX_LOGIN_ATTEMPTS_PER_WINDOW = 10
MAX_REGISTER_ATTEMPTS_PER_WINDOW = 5
# In-memory rate limiting is enough for this academic single-process setup.
# A production deployment with multiple backend instances should use Redis or a similar shared store.
_rate_limit_buckets: dict[str, list[float]] = {}


def _client_key(request: Request, action: str, email: str | None = None) -> str:
    host = request.client.host if request.client else "unknown"
    normalized_email = (email or "").strip().lower()
    return f"{action}:{host}:{normalized_email}"


def _enforce_rate_limit(key: str, max_attempts: int) -> None:
    now = monotonic()
    recent = [
        timestamp
        for timestamp in _rate_limit_buckets.get(key, [])
        if now - timestamp < RATE_LIMIT_WINDOW_SECONDS
    ]
    if len(recent) >= max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Prea multe încercări. Te rugăm să reîncerci peste un minut.",
        )
    recent.append(now)
    _rate_limit_buckets[key] = recent


@router.post("/register", response_model=UserPublic, status_code=201)
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    _enforce_rate_limit(_client_key(request, "register", payload.email), MAX_REGISTER_ATTEMPTS_PER_WINDOW)

    existing = get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=400, detail="Există deja un cont cu această adresă de email.")

    pw_hash = hash_password(payload.password)
    user = create_user(db, payload.name, payload.email, pw_hash)
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    _enforce_rate_limit(_client_key(request, "login", payload.email), MAX_LOGIN_ATTEMPTS_PER_WINDOW)

    user = get_user_by_email(db, payload.email)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Date de autentificare incorecte.")
    if getattr(user, "status", "ACTIVE") != "ACTIVE":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Contul este dezactivat.")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Date de autentificare incorecte.")

    token = create_access_token(user.id)
    return TokenResponse(access_token=token)
