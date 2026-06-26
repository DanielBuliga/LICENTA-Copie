from datetime import date, time
import unittest

from helpers import (
    AvailabilityOverrideStub,
    AvailabilityWindowStub,
    ScheduledBlockStub,
    load_service_module,
)

slot_builder = load_service_module("slot_builder_under_test", "app/services/slot_builder.py")
time_utils = load_service_module("time_utils_for_slot_builder_tests", "app/utils/time_utils.py")

build_free_slots_for_user = slot_builder.build_free_slots_for_user
subtract_intervals = slot_builder.subtract_intervals
LOCAL_TZ = time_utils.LOCAL_TZ
local_date_time_to_utc = time_utils.local_date_time_to_utc


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return list(self.rows)


class FakeDb:
    def __init__(self, *, windows=None, overrides=None, blocks=None):
        self.rows_by_model = {
            AvailabilityWindowStub: windows or [],
            AvailabilityOverrideStub: overrides or [],
            ScheduledBlockStub: blocks or [],
        }

    def query(self, model):
        return FakeQuery(self.rows_by_model.get(model, []))


def local_time_range(slot):
    start, end = slot
    return (
        start.astimezone(LOCAL_TZ).time().replace(second=0, microsecond=0),
        end.astimezone(LOCAL_TZ).time().replace(second=0, microsecond=0),
    )


class SlotBuilderTests(unittest.TestCase):
    def test_subtract_intervals_splits_free_interval_around_busy_time(self):
        free = [(local_date_time_to_utc(date(2026, 6, 29), time(9)), local_date_time_to_utc(date(2026, 6, 29), time(12)))]
        busy = [(local_date_time_to_utc(date(2026, 6, 29), time(10)), local_date_time_to_utc(date(2026, 6, 29), time(11)))]

        result = subtract_intervals(free, busy)

        self.assertEqual([local_time_range(slot) for slot in result], [(time(9), time(10)), (time(11), time(12))])

    def test_build_free_slots_uses_weekly_availability(self):
        monday = date(2026, 6, 29)
        db = FakeDb(
            windows=[
                AvailabilityWindowStub(user_id=1, weekday=0, start_time=time(9), end_time=time(12)),
            ],
        )

        slots = build_free_slots_for_user(db, user_id=1, start_day=monday, horizon_days=1)

        self.assertEqual([local_time_range(slot) for slot in slots], [(time(9), time(12))])

    def test_build_free_slots_removes_full_day_override(self):
        monday = date(2026, 6, 29)
        db = FakeDb(
            windows=[
                AvailabilityWindowStub(user_id=1, weekday=0, start_time=time(9), end_time=time(12)),
            ],
            overrides=[
                AvailabilityOverrideStub(user_id=1, day=monday, is_unavailable=True),
            ],
        )

        slots = build_free_slots_for_user(db, user_id=1, start_day=monday, horizon_days=1)

        self.assertEqual(slots, [])

    def test_build_free_slots_subtracts_partial_override(self):
        monday = date(2026, 6, 29)
        db = FakeDb(
            windows=[
                AvailabilityWindowStub(user_id=1, weekday=0, start_time=time(9), end_time=time(12)),
            ],
            overrides=[
                AvailabilityOverrideStub(user_id=1, day=monday, is_unavailable=False, start_time=time(10), end_time=time(11)),
            ],
        )

        slots = build_free_slots_for_user(db, user_id=1, start_day=monday, horizon_days=1)

        self.assertEqual([local_time_range(slot) for slot in slots], [(time(9), time(10)), (time(11), time(12))])

    def test_build_free_slots_subtracts_existing_scheduled_blocks(self):
        monday = date(2026, 6, 29)
        db = FakeDb(
            windows=[
                AvailabilityWindowStub(user_id=1, weekday=0, start_time=time(9), end_time=time(12)),
            ],
            blocks=[
                ScheduledBlockStub(
                    project_id=1,
                    task_id=1,
                    user_id=1,
                    start_datetime=local_date_time_to_utc(monday, time(9, 30)).replace(tzinfo=None),
                    end_datetime=local_date_time_to_utc(monday, time(10, 30)).replace(tzinfo=None),
                    planned_minutes=60,
                    block_status="PLANNED",
                )
            ],
        )

        slots = build_free_slots_for_user(db, user_id=1, start_day=monday, horizon_days=1)

        self.assertEqual([local_time_range(slot) for slot in slots], [(time(9), time(9, 30)), (time(10, 30), time(12))])


if __name__ == "__main__":
    unittest.main()
