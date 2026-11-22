export type SchedulePreset = "daily" | "weekly" | "mwf" | "custom";
export type SchedulePatch = {
  preset?: SchedulePreset;
  days?: number[];
  times?: string[];
  first_time?: string;
  timezone?: string;
  repetitions?: number;
  enabled?: boolean;
};

export function scheduleDays(preset: string, days: number[]) {
  if (preset === "daily") return [0, 1, 2, 3, 4, 5, 6];
  if (preset === "mwf") return [1, 3, 5];
  return [...new Set(preset === "weekly" ? days.slice(0, 1) : days)].sort();
}

export function editedScheduleTimes(current: string[], patch: SchedulePatch) {
  const times = patch.times ?? (patch.first_time ? [patch.first_time, ...current.slice(1)] : current);
  return [...new Set(times)].sort();
}
