import dayjs, { Dayjs } from "dayjs";

const timezonePattern = /([zZ]|[+-]\d{2}:?\d{2})$/;

export function apiDate(value: string | null | undefined): Dayjs {
  if (!value) return dayjs("");
  return dayjs(timezonePattern.test(value) ? value : `${value}Z`);
}

export function formatApiDate(value: string | null | undefined, format = "DD MMM YYYY, HH:mm") {
  const parsed = apiDate(value);
  return parsed.isValid() ? parsed.format(format) : "-";
}
