import { useState } from "react";
import { Button } from "@/components/ui/button";
import { editedScheduleTimes, scheduleDays, type SchedulePatch, type SchedulePreset } from "@/lib/schedule-settings";

type Schedule = {
  preset: SchedulePreset;
  days: string;
  times_json: string;
  timezone: string;
  repetitions: number;
  enabled: number;
  prompt_enabled: number;
};

const presets = { daily: "Every day", weekly: "Weekly", mwf: "Monday, Wednesday, Friday", custom: "Custom weekdays" };
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ScheduleBulkEditor({ rows, busy, save, cancel }: {
  rows: Schedule[];
  busy: boolean;
  save: (patch: SchedulePatch) => void;
  cancel: () => void;
}) {
  const [patch, setPatch] = useState<SchedulePatch>({});
  const [replaceTimes, setReplaceTimes] = useState(false);
  const [slots, setSlots] = useState("");
  const times = slots.split(",").map(value => value.trim());
  const validTimes = times.length <= 8 && times.every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
  const changes = replaceTimes && validTimes ? { ...patch, times } : patch;
  function currentValue(values: string[]) {
    return new Set(values).size > 1 ? "Mixed" : values[0];
  }
  function weekly(settings: SchedulePatch) {
    return rows.reduce((sum, row) => {
      if (!row.enabled || !row.prompt_enabled) return sum;
      const days = settings.days ?? JSON.parse(row.days) as number[];
      const slots = editedScheduleTimes(JSON.parse(row.times_json), settings);
      return sum + scheduleDays(settings.preset ?? row.preset, days).length * slots.length * (settings.repetitions ?? row.repetitions);
    }, 0);
  }
  return <form className="form-stack" onSubmit={e => { e.preventDefault(); save(changes); }}>
    <div className="form-grid">
      <label className="app-field"><span>Cadence · {currentValue(rows.map(row => presets[row.preset]))}</span>
        <select value={patch.preset ?? ""} onChange={e => setPatch(({ preset: _preset, days: _days, ...rest }) => (
          e.target.value ? { ...rest, preset: e.target.value as SchedulePreset } : rest
        ))}>
          <option value="">Keep each cadence</option>
          {Object.entries(presets).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
        </select>
      </label>
      <label className="app-field"><span>Timezone · {currentValue(rows.map(row => row.timezone))}</span>
        <select value={patch.timezone ?? ""} onChange={e => setPatch(current => ({ ...current, timezone: e.target.value || undefined }))}>
          <option value="">Keep each timezone</option>
          {["UTC", ...Intl.supportedValuesOf("timeZone")].map(zone => <option key={zone}>{zone}</option>)}
        </select>
      </label>
      <label className="app-field"><span>First local time · {currentValue(rows.map(row => JSON.parse(row.times_json)[0]))}</span>
        <input type="time" disabled={replaceTimes} value={patch.first_time ?? ""} onChange={e => setPatch(current => ({ ...current, first_time: e.target.value || undefined }))} />
      </label>
      <label className="app-field"><span>Samples per slot · {currentValue(rows.map(row => String(row.repetitions)))}</span>
        <input type="number" placeholder="Keep each sample count" min={1} max={10} value={patch.repetitions ?? ""} onChange={e => setPatch(current => ({ ...current, repetitions: e.target.value ? Number(e.target.value) : undefined }))} />
      </label>
    </div>
    {(patch.preset === "custom" || patch.preset === "weekly") && <fieldset>
      <legend>Weekdays · {currentValue(rows.map(row => (JSON.parse(row.days) as number[]).map(day => weekdays[day]).join(", ")))}</legend>
      {weekdays.map((day, index) => <label className="check-field" key={day}>
        <input type={patch.preset === "weekly" ? "radio" : "checkbox"} name={patch.preset === "weekly" ? "bulk-weekday" : undefined}
          checked={patch.days?.includes(index) ?? false}
          onChange={e => setPatch(current => ({ ...current, days: current.preset === "weekly"
            ? [index] : e.target.checked ? [...(current.days ?? []), index] : current.days?.filter(value => value !== index) }))} /> {day}
      </label>)}
    </fieldset>}
    <label className="check-field"><input type="checkbox" checked={replaceTimes} onChange={e => {
      setReplaceTimes(e.target.checked);
      setPatch(({ first_time: _time, ...rest }) => rest);
    }} /> Replace the complete time-slot list</label>
    {replaceTimes && <label className="app-field"><span>Local times, separated by commas</span>
      <input required placeholder="09:00, 17:00" value={slots} onChange={e => setSlots(e.target.value)} />
    </label>}
    <p aria-live="polite">{rows.length} schedules selected. Expected active checks per week {weekly({})} → {weekly(changes)}.</p>
    <div className="form-actions">
      <Button disabled={busy || !Object.values(changes).some(value => value !== undefined) || (replaceTimes && !validTimes)
        || (["custom", "weekly"].includes(patch.preset ?? "") && !patch.days?.length)}>Save settings</Button>
      <Button type="button" variant="ghost" onClick={cancel}>Cancel bulk edit</Button>
    </div>
  </form>;
}
