from datetime import datetime, timezone
import unittest

from pydantic import ValidationError

from helpers import load_module

assignment_schema = load_module("assignment_schema_under_test", "app/schemas/assignment.py")
availability_schema = load_module("availability_schema_under_test", "app/schemas/availability.py")
task_schema = load_module("task_schema_under_test", "app/schemas/task.py")

AssignmentCreate = assignment_schema.AssignmentCreate
WindowItem = availability_schema.WindowItem
TaskCreate = task_schema.TaskCreate
TaskUpdate = task_schema.TaskUpdate


class SchemaValidationTests(unittest.TestCase):
    def test_task_create_rejects_priority_outside_accepted_range(self):
        with self.assertRaises(ValidationError):
            TaskCreate(
                title="Task",
                priority=6,
                estimate_minutes=60,
                deadline=datetime(2026, 6, 30, 12, tzinfo=timezone.utc),
            )

    def test_task_create_rejects_zero_estimate(self):
        with self.assertRaises(ValidationError):
            TaskCreate(
                title="Task",
                priority=3,
                estimate_minutes=0,
                deadline=datetime(2026, 6, 30, 12, tzinfo=timezone.utc),
            )

    def test_task_update_rejects_negative_estimate(self):
        with self.assertRaises(ValidationError):
            TaskUpdate(estimate_minutes=-30)

    def test_window_item_rejects_invalid_weekday(self):
        with self.assertRaises(ValidationError):
            WindowItem(weekday=7, start_time="09:00", end_time="10:00")

    def test_assignment_create_rejects_zero_assigned_minutes(self):
        with self.assertRaises(ValidationError):
            AssignmentCreate(user_id=1, assigned_minutes=0)

    def test_assignment_create_accepts_manual_override_confirmation(self):
        payload = AssignmentCreate(user_id=1, assigned_minutes=None, allow_ineligible=True)

        self.assertTrue(payload.allow_ineligible)


if __name__ == "__main__":
    unittest.main()
