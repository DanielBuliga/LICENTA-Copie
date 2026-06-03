from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.models.task_dependency import TaskDependency
from app.models.task_assignment import TaskAssignment
from app.models.task_skill_requirement import TaskSkillRequirement
from app.models.scheduled_block import ScheduledBlock
from app.models.project_document import ProjectDocument
from app.models.project_message import ProjectMessage
from app.models.notification import Notification, NotificationDeliveryLog


def delete_project_cascade(db: Session, project_id: int) -> None:
    # Delete in safe order to avoid FK errors

    # 1) notifications/logs that reference project or project tasks
    task_ids = [tid for (tid,) in db.query(Task.id).filter(Task.project_id == project_id).all()]
    notification_query = db.query(Notification.id).filter(Notification.project_id == project_id)
    notification_ids = [nid for (nid,) in notification_query.all()]
    if notification_ids:
        db.query(NotificationDeliveryLog).filter(NotificationDeliveryLog.notification_id.in_(notification_ids)).delete(synchronize_session=False)
        db.query(Notification).filter(Notification.id.in_(notification_ids)).delete(synchronize_session=False)

    # 2) project documents/messages
    db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).delete()
    db.query(ProjectMessage).filter(ProjectMessage.project_id == project_id).delete()

    # 3) scheduled blocks
    db.query(ScheduledBlock).filter(ScheduledBlock.project_id == project_id).delete()

    # 4) dependencies
    db.query(TaskDependency).filter(TaskDependency.project_id == project_id).delete()

    # 5) tasks related tables
    if task_ids:
        db.query(TaskAssignment).filter(TaskAssignment.task_id.in_(task_ids)).delete()
        db.query(TaskSkillRequirement).filter(TaskSkillRequirement.task_id.in_(task_ids)).delete()

    # 6) tasks
    db.query(Task).filter(Task.project_id == project_id).delete()

    # 7) members
    db.query(ProjectMember).filter(ProjectMember.project_id == project_id).delete()

    # 8) project
    db.query(Project).filter(Project.id == project_id).delete()

    db.commit()
