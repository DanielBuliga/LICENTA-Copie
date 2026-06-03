from pathlib import Path
import re
import unicodedata

from sqlalchemy.orm import Session

from app.core.config import UPLOAD_DIR
from app.models.project_document import ProjectDocument
from app.models.skill import Skill
from app.models.task import Task
from app.services.skills_service import list_skills

TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".xml", ".html", ".css", ".js", ".ts", ".tsx", ".py", ".java", ".sql"}
DOCUMENT_UPLOAD_DIR = Path(UPLOAD_DIR) / "documents"


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9+#.]+", " ", value.lower()).strip()


def skill_tokens(name: str) -> list[str]:
    return [token for token in normalize_text(name).split() if token]


def stored_document_path(document_id: int) -> Path | None:
    if not DOCUMENT_UPLOAD_DIR.exists():
        return None
    matches = sorted(DOCUMENT_UPLOAD_DIR.glob(f"{document_id}_*"))
    return matches[0] if matches else None


def read_document_text(document: ProjectDocument) -> str:
    pieces = [document.file_name, document.description or ""]
    path = stored_document_path(document.id)
    if path and path.suffix.lower() in TEXT_EXTENSIONS and path.exists():
        try:
            pieces.append(path.read_text(encoding="utf-8", errors="ignore")[:20_000])
        except OSError:
            pass
    return "\n".join(piece for piece in pieces if piece)


def build_task_corpus(db: Session, task: Task) -> tuple[str, int]:
    documents = (
        db.query(ProjectDocument)
        .filter(ProjectDocument.project_id == task.project_id, ProjectDocument.task_id == task.id)
        .all()
    )
    parts = [task.title, task.description or ""]
    parts.extend(read_document_text(document) for document in documents)
    return "\n".join(part for part in parts if part), len(documents)


def match_skill(skill: Skill, normalized_corpus: str) -> tuple[bool, float, str]:
    normalized_name = normalize_text(skill.name)
    tokens = skill_tokens(skill.name)
    if not normalized_name or not tokens:
        return False, 0, ""

    exact_pattern = rf"(?<![a-z0-9+#.]){re.escape(normalized_name)}(?![a-z0-9+#.])"
    if re.search(exact_pattern, normalized_corpus):
        return True, 0.95, "Potrivire directa in descriere/documente"

    matched_tokens = [token for token in tokens if re.search(rf"(?<![a-z0-9+#.]){re.escape(token)}(?![a-z0-9+#.])", normalized_corpus)]
    ratio = len(matched_tokens) / len(tokens)
    if len(tokens) > 1 and ratio >= 0.75:
        return True, round(0.65 + 0.25 * ratio, 2), "Majoritatea termenilor din skill apar in text"

    return False, 0, ""


def infer_min_level(confidence: float) -> int:
    if confidence >= 0.9:
        return 3
    if confidence >= 0.75:
        return 2
    return 1


def extract_task_skills(db: Session, task: Task) -> dict:
    corpus, document_count = build_task_corpus(db, task)
    normalized_corpus = normalize_text(corpus)
    suggestions = []

    for skill in list_skills(db):
        matched, confidence, reason = match_skill(skill, normalized_corpus)
        if matched:
            suggestions.append(
                {
                    "skill_id": skill.id,
                    "name": skill.name,
                    "min_level": infer_min_level(confidence),
                    "confidence": confidence,
                    "reason": reason,
                }
            )

    suggestions.sort(key=lambda item: (-item["confidence"], item["name"].lower()))
    return {
        "task_id": task.id,
        "document_count": document_count,
        "suggestions": suggestions,
    }
