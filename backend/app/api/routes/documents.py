from pathlib import Path
from email import policy
from email.parser import BytesParser
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.auth_deps import get_current_user
from app.core.config import MAX_UPLOAD_BYTES, UPLOAD_DIR
from app.core.deps import get_db
from app.models.project_document import ProjectDocument
from app.schemas.document import DocumentPublic
from app.services.projects_service import is_member
from app.services.tasks_service import get_task

router = APIRouter(tags=["documents"])

DOCUMENT_UPLOAD_DIR = Path(UPLOAD_DIR) / "documents"
ALLOWED_DOCUMENT_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".txt",
    ".md",
    ".png",
    ".jpg",
    ".jpeg",
    ".xlsx",
    ".pptx",
}


def safe_filename(filename: str) -> str:
    cleaned = Path(filename).name.strip()
    cleaned = re.sub(r"[^A-Za-z0-9._ -]+", "_", cleaned)
    return cleaned[:180] or "document"


def document_storage_path(document_id: int, file_name: str) -> Path:
    return DOCUMENT_UPLOAD_DIR / f"{document_id}_{safe_filename(file_name)}"


def validate_document_file(file_name: str, file_bytes: bytes) -> None:
    extension = Path(file_name).suffix.lower()
    if extension not in ALLOWED_DOCUMENT_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_DOCUMENT_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Tip de fișier nepermis. Sunt acceptate: {allowed}.",
        )
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        max_mb = max(1, MAX_UPLOAD_BYTES // (1024 * 1024))
        raise HTTPException(status_code=413, detail=f"Fișierul este prea mare. Dimensiunea maximă este {max_mb} MB.")


def find_stored_document(document_id: int) -> Path | None:
    if not DOCUMENT_UPLOAD_DIR.exists():
        return None
    matches = sorted(DOCUMENT_UPLOAD_DIR.glob(f"{document_id}_*"))
    return matches[0] if matches else None


def parse_multipart_upload(content_type: str | None, body: bytes) -> tuple[str, bytes, dict[str, str]]:
    if not content_type or "multipart/form-data" not in content_type:
        raise HTTPException(status_code=400, detail="Expected multipart/form-data")
    if len(body) > MAX_UPLOAD_BYTES:
        max_mb = max(1, MAX_UPLOAD_BYTES // (1024 * 1024))
        raise HTTPException(status_code=413, detail=f"Fișierul este prea mare. Dimensiunea maximă este {max_mb} MB.")

    message_bytes = b"Content-Type: " + content_type.encode("utf-8") + b"\r\nMIME-Version: 1.0\r\n\r\n" + body
    message = BytesParser(policy=policy.default).parsebytes(message_bytes)
    fields: dict[str, str] = {}
    file_name: str | None = None
    file_bytes: bytes | None = None

    for part in message.iter_parts():
        if part.get_content_disposition() != "form-data":
            continue
        name = part.get_param("name", header="content-disposition")
        filename = part.get_filename()
        payload = part.get_payload(decode=True) or b""
        if filename:
            file_name = safe_filename(filename)
            file_bytes = payload
        elif name:
            charset = part.get_content_charset() or "utf-8"
            fields[name] = payload.decode(charset, errors="replace")

    if file_name is None or file_bytes is None:
        raise HTTPException(status_code=400, detail="Lipsește fișierul încărcat.")
    validate_document_file(file_name, file_bytes)
    return file_name, file_bytes, fields


def save_upload_file(file_bytes: bytes, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(file_bytes)


@router.get("/projects/{project_id}/documents", response_model=list[DocumentPublic])
def list_project_documents(
    project_id: int,
    task_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    query = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id)
    if task_id is not None:
        query = query.filter(ProjectDocument.task_id == task_id)

    return query.order_by(ProjectDocument.created_at.desc()).all()


@router.post("/projects/{project_id}/documents/upload", response_model=DocumentPublic, status_code=201)
async def upload_project_document(
    project_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not is_member(db, project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    file_name, file_bytes, fields = parse_multipart_upload(request.headers.get("content-type"), await request.body())
    task_id_value = fields.get("task_id")
    try:
        task_id = int(task_id_value) if task_id_value and task_id_value.strip() else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid task_id")
    description = fields.get("description")

    if task_id is not None:
        task = get_task(db, task_id)
        if not task or task.project_id != project_id:
            raise HTTPException(status_code=400, detail="Invalid task_id")

    row = ProjectDocument(
        project_id=project_id,
        task_id=task_id,
        uploaded_by=current_user.id,
        file_name=file_name,
        file_url=None,
        description=description.strip() if description and description.strip() else None,
    )
    db.add(row)
    db.flush()

    destination = document_storage_path(row.id, file_name)
    save_upload_file(file_bytes, destination)
    row.file_url = f"/documents/{row.id}/download"

    db.commit()
    db.refresh(row)
    return row


@router.get("/documents/{document_id}/download")
def download_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = db.query(ProjectDocument).filter(ProjectDocument.id == document_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")

    if not is_member(db, row.project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    stored_path = find_stored_document(row.id)
    if not stored_path or not stored_path.exists():
        raise HTTPException(status_code=404, detail="Stored file not found")

    return FileResponse(stored_path, filename=row.file_name)


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = db.query(ProjectDocument).filter(ProjectDocument.id == document_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")

    if not is_member(db, row.project_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a project member")

    if row.uploaded_by != current_user.id:
        # OWNER/ADMIN check can be added later; this keeps MVP conservative.
        raise HTTPException(status_code=403, detail="Only uploader can delete this document")

    stored_path = find_stored_document(row.id)
    if stored_path:
        stored_path.unlink(missing_ok=True)

    db.delete(row)
    db.commit()
    return None
