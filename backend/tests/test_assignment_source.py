import unittest

from helpers import load_service_module

assignments_service = load_service_module("assignments_service_under_test", "app/services/assignments_service.py")
create_assignment = assignments_service.create_assignment


class FakeDb:
    def __init__(self):
        self.added = []
        self.commits = 0

    def add(self, row):
        row.id = len(self.added) + 1
        self.added.append(row)

    def commit(self):
        self.commits += 1

    def refresh(self, row):
        pass


class AssignmentSourceTests(unittest.TestCase):
    def test_create_assignment_defaults_to_manual(self):
        db = FakeDb()

        row = create_assignment(db, task_id=1, user_id=7, assigned_minutes=60)

        self.assertEqual(row.assignment_source, "MANUAL")
        self.assertEqual(db.commits, 1)

    def test_create_assignment_accepts_auto_source(self):
        db = FakeDb()

        row = create_assignment(db, task_id=1, user_id=7, assigned_minutes=60, assignment_source="AUTO")

        self.assertEqual(row.assignment_source, "AUTO")
        self.assertEqual(db.commits, 1)


if __name__ == "__main__":
    unittest.main()
