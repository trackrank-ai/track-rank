export function collectionVariantLabel(engine: string | undefined, workspaceName: string, engines: Record<string, string>) {
  return [engine ? engines[engine] ?? engine : "Unknown engine", workspaceName].filter(Boolean).join(" · ");
}

export function scheduleCadence(schedule: { preset: string; days: string; times_json: string; timezone: string }, locale?: string) {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  const list = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });
  const days = (JSON.parse(schedule.days) as number[]).map(day => weekday.format(Date.UTC(2024, 0, 7 + day)));
  const times = (JSON.parse(schedule.times_json) as string[]).map(slot => time.format(new Date(`2024-01-07T${slot}Z`)));
  const cadence = schedule.preset === "daily" ? "Daily"
    : schedule.preset === "weekly" ? `Weekly on ${days[0]}` : list.format(days);
  return `${cadence} at ${list.format(times)} (${schedule.timezone})`;
}
