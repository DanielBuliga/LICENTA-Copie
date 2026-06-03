from datetime import datetime, date, time, timezone
from zoneinfo import ZoneInfo

LOCAL_TZ = ZoneInfo("Europe/Bucharest")


def as_utc(dt: datetime) -> datetime:
    """
    Convert any datetime to UTC-aware.
    If dt is naive, treat it as UTC.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def utc_naive(dt: datetime) -> datetime:
    """
    Return a naive datetime that represents UTC time.
    Good for storing in MySQL DATETIME.
    """
    return as_utc(dt).replace(tzinfo=None)


def local_date_time_to_utc(date_value: date, time_value: time) -> datetime:
    """
    Interpret (date + time) as LOCAL time and convert to UTC-aware datetime.
    """
    local_dt = datetime(
        date_value.year,
        date_value.month,
        date_value.day,
        time_value.hour,
        time_value.minute,
        time_value.second,
        tzinfo=LOCAL_TZ,
    )
    return local_dt.astimezone(timezone.utc)


def local_midnight_to_utc(day: date) -> datetime:
    """
    Local midnight -> UTC-aware datetime.
    """
    local_midnight = datetime(day.year, day.month, day.day, 0, 0, 0, tzinfo=LOCAL_TZ)
    return local_midnight.astimezone(timezone.utc)