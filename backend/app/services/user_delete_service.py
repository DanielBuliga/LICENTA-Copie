from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.availability_override import AvailabilityOverride
from app.models.availability_window import AvailabilityWindow
from app.models.notification import Notification, NotificationDeliveryLog, NotificationPreference
from app.models.project import Project
from app.models.project_document import ProjectDocument
from app.models.project_member import ProjectMember
from app.models.project_message import ProjectMessage
from app.models.scheduled_block import ScheduledBlock
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.task_dependency import TaskDependency
from app.models.task_skill_requirement import TaskSkillRequirement
from app.models.user import User
from app.models.user_skill import UserSkill
from app.services.project_delete_service import delete_project_cascade


def _delete_tasks_cascade(db: Session, task_ids: list[int]) -> None:
    if not task_ids:
        return

    notification_ids = [nid for (nid,) in db.query(Notification.id).filter(Notification.task_id.in_(task_ids)).all()]
    if notification_ids:
        db.query(NotificationDeliveryLog).filter(NotificationDeliveryLog.notification_id.in_(notification_ids)).delete(synchronize_session=False)
        db.query(Notification).filter(Notification.id.in_(notification_ids)).delete(synchronize_session=False)

    db.query(ProjectDocument).filter(ProjectDocument.task_id.in_(task_ids)).delete(synchronize_session=False)
    db.query(ScheduledBlock).filter(ScheduledBlock.task_id.in_(task_ids)).delete(synchronize_session=False)
    db.query(TaskAssignment).filter(TaskAssignment.task_id.in_(task_ids)).delete(synchronize_session=False)
    db.query(TaskSkillRequirement).filter(TaskSkillRequirement.task_id.in_(task_ids)).delete(synchronize_session=False)
    db.query(TaskDependency).filter(
        or_(TaskDependency.predecessor_task_id.in_(task_ids), TaskDependency.successor_task_id.in_(task_ids))
    ).delete(synchronize_session=False)
    db.query(Task).filter(Task.id.in_(task_ids)).delete(synchronize_session=False)


def delete_user_account(db: Session, user_id: int) -> None:
    owned_project_ids = [pid for (pid,) in db.query(Project.id).filter(Project.created_by == user_id).all()]
    for project_id in owned_project_ids:
        delete_project_cascade(db, project_id)

    created_task_ids = [tid for (tid,) in db.query(Task.id).filter(Task.created_by == user_id).all()]
    _delete_tasks_cascade(db, created_task_ids)

    uploaded_document_ids = [did for (did,) in db.query(ProjectDocument.id).filter(ProjectDocument.uploaded_by == user_id).all()]
    if uploaded_document_ids:
        db.query(ProjectDocument).filter(ProjectDocument.id.in_(uploaded_document_ids)).delete(synchronize_session=False)

    notification_ids = [nid for (nid,) in db.query(Notification.id).filter(Notification.user_id == user_id).all()]
    if notification_ids:
        db.query(NotificationDeliveryLog).filter(NotificationDeliveryLog.notification_id.in_(notification_ids)).delete(synchronize_session=False)
        db.query(Notification).filter(Notification.id.in_(notification_ids)).delete(synchronize_session=False)

    db.query(NotificationDeliveryLog).filter(NotificationDeliveryLog.user_id == user_id).delete()
    db.query(NotificationPreference).filter(NotificationPreference.user_id == user_id).delete()
    db.query(ProjectMessage).filter(ProjectMessage.sender_id == user_id).delete()
    db.query(ScheduledBlock).filter(ScheduledBlock.user_id == user_id).delete()
    db.query(TaskAssignment).filter(TaskAssignment.user_id == user_id).delete()
    db.query(ProjectMember).filter(ProjectMember.user_id == user_id).delete()
    db.query(AvailabilityOverride).filter(AvailabilityOverride.user_id == user_id).delete()
    db.query(AvailabilityWindow).filter(AvailabilityWindow.user_id == user_id).delete()
    db.query(UserSkill).filter(UserSkill.user_id == user_id).delete()
    db.query(User).filter(User.id == user_id).delete()
    db.commit()
