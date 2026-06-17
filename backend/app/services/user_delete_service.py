from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.project_member import ProjectMember
from app.models.scheduled_block import ScheduledBlock
from app.models.user import User
from app.services.activity_service import log_project_activity
from app.services.notification_service import notify_member_inactive_replan_needed
from app.utils.time_utils import utc_naive


def delete_user_account(db: Session, user_id: int) -> None:
    """
    Soft-delete a user account.

    Historical entities remain in place: tasks, assignments, documents and messages
    still point to the same user id, so project history stays readable. The user can
    no longer authenticate, is marked inactive in all projects, and future planned
    blocks are removed because they no longer represent real availability.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return

    now = datetime.now(timezone.utc)
    user.status = "DEACTIVATED"
    user.deactivated_at = now
    db.add(user)

    memberships = db.query(ProjectMember).filter(ProjectMember.user_id == user_id).all()
    project_ids = [member.project_id for member in memberships]
    for project_id in project_ids:
        active_owners = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project_id, ProjectMember.role == "OWNER", ProjectMember.status == "ACTIVE")
            .all()
        )
        if len(active_owners) == 1 and active_owners[0].user_id == user_id:
            replacement = (
                db.query(ProjectMember)
                .filter(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id != user_id,
                    ProjectMember.status == "ACTIVE",
                    ProjectMember.role == "ADMIN",
                )
                .order_by(ProjectMember.joined_at)
                .first()
            )
            if not replacement:
                replacement = (
                    db.query(ProjectMember)
                    .filter(ProjectMember.project_id == project_id, ProjectMember.user_id != user_id, ProjectMember.status == "ACTIVE")
                    .order_by(ProjectMember.joined_at)
                    .first()
                )
            if replacement:
                replacement.role = "OWNER"
                db.add(replacement)

    for member in memberships:
        member.status = "INACTIVE"
        member.inactive_at = now
        member.inactive_reason = "Cont dezactivat"
        db.add(member)

    db.query(ScheduledBlock).filter(
        ScheduledBlock.user_id == user_id,
        ScheduledBlock.end_datetime >= utc_naive(now),
    ).delete(synchronize_session=False)

    db.commit()

    for project_id in project_ids:
        log_project_activity(
            db,
            project_id,
            "MEMBER_STATUS_CHANGED",
            f"Membru inactiv: {user.name or user.email}",
            actor_id=user_id,
            entity_type="MEMBER",
            entity_id=user_id,
            details="Contul utilizatorului a fost dezactivat.",
        )
        notify_member_inactive_replan_needed(db, project_id, user_id)
