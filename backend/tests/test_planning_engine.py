from datetime import datetime, timezone
import unittest

from helpers import TaskStub, load_service_module

planning_engine = load_service_module("planning_engine_under_test", "app/services/planning_engine.py")
pack_task_into_slots = planning_engine.pack_task_into_slots


class FakeDb:
    def __init__(self):
        self.added = []

    def add(self, row):
        row.id = len(self.added) + 1
        self.added.append(row)

    def commit(self):
        pass

    def refresh(self, row):
        pass


def utc_dt(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


def make_task(*, task_id: int = 1, estimate_minutes: int = 60, deadline: datetime | None = None) -> TaskStub:
    return TaskStub(
        id=task_id,
        project_id=1,
        title=f"Task {task_id}",
        description=None,
        parent_task_id=None,
        priority=3,
        estimate_minutes=estimate_minutes,
        deadline=deadline or utc_dt(2026, 6, 29, 18),
        status="OPEN",
        created_by=1,
    )


class PlanningEngineTests(unittest.TestCase):
    def test_pack_task_splits_work_across_multiple_slots(self):
        db = FakeDb()
        task = make_task(estimate_minutes=90, deadline=utc_dt(2026, 6, 29, 14))
        slots = [
            (utc_dt(2026, 6, 29, 9), utc_dt(2026, 6, 29, 10)),
            (utc_dt(2026, 6, 29, 11), utc_dt(2026, 6, 29, 12)),
        ]

        created, remaining, last_end = pack_task_into_slots(
            db=db,
            project_id=1,
            task=task,
            user_id=7,
            slots=slots,
            earliest_start=utc_dt(2026, 6, 29, 9),
        )

        self.assertEqual(created, 2)
        self.assertEqual(remaining, 0)
        self.assertEqual(last_end, utc_dt(2026, 6, 29, 11, 30))
        self.assertEqual([block.planned_minutes for block in db.added], [60, 30])
        self.assertEqual(slots, [(utc_dt(2026, 6, 29, 11, 30), utc_dt(2026, 6, 29, 12))])

    def test_pack_task_respects_deadline_and_reports_remaining_minutes(self):
        db = FakeDb()
        task = make_task(estimate_minutes=60, deadline=utc_dt(2026, 6, 29, 9, 45))
        slots = [(utc_dt(2026, 6, 29, 9), utc_dt(2026, 6, 29, 10))]

        created, remaining, last_end = pack_task_into_slots(
            db=db,
            project_id=1,
            task=task,
            user_id=7,
            slots=slots,
            earliest_start=utc_dt(2026, 6, 29, 9),
        )

        self.assertEqual(created, 1)
        self.assertEqual(remaining, 15)
        self.assertEqual(last_end, utc_dt(2026, 6, 29, 9, 45))
        self.assertEqual(db.added[0].planned_minutes, 45)
        self.assertEqual(slots, [(utc_dt(2026, 6, 29, 9, 45), utc_dt(2026, 6, 29, 10))])

    def test_pack_task_keeps_left_side_of_slot_before_earliest_start(self):
        db = FakeDb()
        task = make_task(estimate_minutes=30, deadline=utc_dt(2026, 6, 29, 12))
        slots = [(utc_dt(2026, 6, 29, 9), utc_dt(2026, 6, 29, 11))]

        created, remaining, last_end = pack_task_into_slots(
            db=db,
            project_id=1,
            task=task,
            user_id=7,
            slots=slots,
            earliest_start=utc_dt(2026, 6, 29, 10),
        )

        self.assertEqual(created, 1)
        self.assertEqual(remaining, 0)
        self.assertEqual(last_end, utc_dt(2026, 6, 29, 10, 30))
        self.assertEqual(
            slots,
            [
                (utc_dt(2026, 6, 29, 9), utc_dt(2026, 6, 29, 10)),
                (utc_dt(2026, 6, 29, 10, 30), utc_dt(2026, 6, 29, 11)),
            ],
        )

    def test_pack_task_does_not_plan_after_deadline(self):
        db = FakeDb()
        task = make_task(estimate_minutes=30, deadline=utc_dt(2026, 6, 29, 10))
        slots = [(utc_dt(2026, 6, 29, 10), utc_dt(2026, 6, 29, 11))]

        created, remaining, last_end = pack_task_into_slots(
            db=db,
            project_id=1,
            task=task,
            user_id=7,
            slots=slots,
            earliest_start=utc_dt(2026, 6, 29, 9),
        )

        self.assertEqual(created, 0)
        self.assertEqual(remaining, 30)
        self.assertIsNone(last_end)
        self.assertEqual(db.added, [])
        self.assertEqual(slots, [(utc_dt(2026, 6, 29, 10), utc_dt(2026, 6, 29, 11))])

    def test_pack_task_can_plan_only_remaining_minutes_for_replan(self):
        db = FakeDb()
        task = make_task(estimate_minutes=120, deadline=utc_dt(2026, 6, 29, 12))
        slots = [(utc_dt(2026, 6, 29, 9), utc_dt(2026, 6, 29, 11))]

        created, remaining, last_end = pack_task_into_slots(
            db=db,
            project_id=1,
            task=task,
            user_id=7,
            slots=slots,
            earliest_start=utc_dt(2026, 6, 29, 9),
            minutes_to_plan=45,
        )

        self.assertEqual(created, 1)
        self.assertEqual(remaining, 0)
        self.assertEqual(last_end, utc_dt(2026, 6, 29, 9, 45))
        self.assertEqual(db.added[0].planned_minutes, 45)
        self.assertEqual(slots, [(utc_dt(2026, 6, 29, 9, 45), utc_dt(2026, 6, 29, 11))])


if __name__ == "__main__":
    unittest.main()
