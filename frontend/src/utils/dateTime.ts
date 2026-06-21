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

export function formatApiDatesInText(text: string) {
  return text
    .replace(
      /\b(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?\b/g,
      (_match, date: string, time: string) => formatApiDate(`${date}T${time}`, "DD.MM.YYYY HH:mm")
    )
    .replace(
      /\b(\d{2})\.(\d{2})\.(\d{4}) (\d{2}:\d{2}) - (\d{2}:\d{2})\b/g,
      (_match, day: string, month: string, year: string, start: string, end: string) => {
        const startDate = apiDate(`${year}-${month}-${day}T${start}:00`);
        const endDate = apiDate(`${year}-${month}-${day}T${end}:00`);
        if (!startDate.isValid() || !endDate.isValid()) return `${day}.${month}.${year} ${start} - ${end}`;
        return `${startDate.format("DD.MM.YYYY HH:mm")} - ${endDate.format("HH:mm")}`;
      }
    );
}
