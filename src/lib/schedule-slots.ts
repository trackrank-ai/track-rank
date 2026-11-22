const formatters = new Map<string, Intl.DateTimeFormat>();

export function localSlot(date: Date, timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    if (formatters.size >= 128) formatters.clear();
    formatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
  };
}
type Schedule = { timezone: string; days: number[]; times: string[] };
const minute = 60_000;
const day = 86_400_000;

function offsetAt(time: number, timezone: string) {
  const slot = localSlot(new Date(time), timezone);
  return Date.parse(`${slot.date}T${slot.time}Z`) - Math.floor(time / minute) * minute;
}

export function nextScheduleSlot(schedule: Schedule, after: number, lastSlot?: string | null, earliestDate?: string) {
  const { timezone, times, days } = schedule;
  const local = localSlot(new Date(after), timezone);
  const firstDay = Date.parse(local.date + "T00:00Z");
  for (let index = 0; index <= 14; index++) {
    const calendarDay = new Date(firstDay + index * day);
    if (!days.includes(calendarDay.getUTCDay())) continue;
    const date = calendarDay.toISOString().slice(0, 10);
    if (earliestDate && date < earliestDate) continue;
    // The offsets sampled around this local date allow either side of a DST change.
    const offsets = new Set([offsetAt(calendarDay.getTime() - day, timezone), offsetAt(calendarDay.getTime() + day, timezone)]);
    for (const time of times) {
      const slot = `${date}@${time}`;
      if (lastSlot && slot <= lastSlot) continue;
      const wall = Date.parse(`${date}T${time}Z`);
      const candidates = [...offsets].map(offset => wall - offset).filter(candidate => {
        const check = localSlot(new Date(candidate), timezone);
        return check.date === date && check.time === time;
      });
      // Only the first occurrence runs in a repeated hour. Nonexistent times are skipped.
      if (candidates.length && Math.min(...candidates) > after) return Math.min(...candidates);
    }
  }
  return null;
}
