import unittest

from helpers import ScheduledBlockStub, TaskAssignmentStub, TaskStub, load_service_module

task_status_service = load_service_module("task_status_under_test", "app/services/task_status_service.py")
recompute_task_status = task_status_service.recompute_task_status


class FakeQuery:
    def __init__(self):
        self.deleted = False

    def filter(self, *args, **kwargs):
        return self

    def delete(self):
        self.deleted = True


class FakeDb:
    def __init__(self, assignments):
        self.assignments = assignments
        self.commits = 0
        self.added = []
        self.block_query = FakeQuery()

    def add(self, row):
        self.added.append(row)

    def commit(self):
        self.commits += 1

    def refresh(self, row):
        pass

    def query(self, model):
        if model is ScheduledBlockStub:
            return self.block_query
        return FakeQuery()


def make_task(status: str = "OPEN") -> TaskStub:
    return TaskStub(
        id=1,
        project_id=1,
        title="Task",
        description=None,
        parent_task_id=None,
        priority=3,
        estimate_minutes=60,
        deadline=None,
        status=status,
        created_by=1,
    )


def assignment(status: str) -> TaskAssignmentStub:
    return TaskAssignmentStub(task_id=1, user_id=1, member_status=status)


class TaskStatusTests(unittest.TestCase):
    def test_all_todo_keeps_task_open(self):
        db = FakeDb([assignment("TODO"), assignment("TODO")])
        task = make_task(status="IN_PROGRESS")

        recompute_task_status(db, task)

        self.assertEqual(task.status, "OPEN")

    def test_any_in_progress_sets_task_in_progress(self):
        db = FakeDb([assignment("TODO"), assignment("IN_PROGRESS")])
        task = make_task(status="OPEN")

        recompute_task_status(db, task)

        self.assertEqual(task.status, "IN_PROGRESS")

    def test_all_done_sets_task_ready_to_close(self):
        db = FakeDb([assignment("DONE"), assignment("DONE")])
        task = make_task(status="IN_PROGRESS")

        recompute_task_status(db, task)

        self.assertEqual(task.status, "READY_TO_CLOSE")
        self.assertTrue(db.block_query.deleted)

    def test_closed_task_is_not_changed(self):
        db = FakeDb([assignment("TODO")])
        task = make_task(status="CLOSED")

        recompute_task_status(db, task)

        self.assertEqual(task.status, "CLOSED")
        self.assertEqual(db.commits, 0)


if __name__ == "__main__":
    unittest.main()
