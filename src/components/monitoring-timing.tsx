import { useId } from "react";
import { Button } from "@/components/ui/button";
import { scheduleDays, type SchedulePreset } from "@/lib/schedule-settings";
import { nextScheduleSlot } from "@/lib/schedule-slots";

export type MonitoringTiming = {
  name: string;
  preset: SchedulePreset;
  days: number[];
  times: string[];
  timezone: string;
  repetitions: number;
};

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const presets = { daily: "Daily", weekly: "Weekly", mwf: "Monday, Wednesday, Friday", custom: "Custom weekdays" };

export function defaultMonitoringTiming(): MonitoringTiming {
  return { name: "", preset: "weekly", days: [1], times: ["09:00"], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", repetitions: 1 };
}

export function monitoringProjection(timing: MonitoringTiming, count: number) {
  const days = scheduleDays(timing.preset, timing.days);
  const times = [...new Set(timing.times)].sort();
  const valid = !!days.length && times.every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
  const next = valid ? nextScheduleSlot({ days, times, timezone: timing.timezone }, Date.now()) : null;
  return {
    valid, weekly: count * days.length * times.length * timing.repetitions,
    next: next === null ? "" : new Intl.DateTimeFormat(undefined, {
      dateStyle: "full", timeStyle: "short", timeZone: timing.timezone,
    }).format(next) + " (" + timing.timezone + ")",
  };
}

export function MonitoringEditor({ timing, change, count }: {
  timing: MonitoringTiming; change: (value: MonitoringTiming) => void; count: number;
}) {
  const weekdayGroup = useId();
  const projection = monitoringProjection(timing, count);
  const setTime = (index: number, value: string) => change({ ...timing, times: timing.times.map((time, i) => i === index ? value : time) });
  return <div className="form-stack">
    <details className="advanced-settings">
      <summary>{presets[timing.preset]}{timing.preset === "weekly" && timing.days.length ? ` on ${weekdays[timing.days[0]]}` : ""}
        {" at "}{timing.times[0]} · {timing.timezone} · Change timing</summary>
      <div className="form-grid">
        <label className="app-field"><span>Cadence</span><select value={timing.preset} onChange={e => change({ ...timing, preset: e.target.value as SchedulePreset, days: [timing.days[0] ?? 1] })}>
          {Object.entries(presets).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <label className="app-field"><span>Local time</span><input type="time" value={timing.times[0]} onChange={e => setTime(0, e.target.value)} /></label>
        <label className="app-field"><span>Timezone</span><select value={timing.timezone} onChange={e => change({ ...timing, timezone: e.target.value })}>
          {[...new Set([timing.timezone, "UTC", ...Intl.supportedValuesOf("timeZone")])].sort().map(zone => <option key={zone}>{zone}</option>)}
        </select></label>
      </div>
      {["weekly", "custom"].includes(timing.preset) && <fieldset><legend>Weekdays</legend>
        {weekdays.map((day, index) => <label key={day} className="check-field">
          <input type={timing.preset === "weekly" ? "radio" : "checkbox"} name={`monitoring-weekday-${weekdayGroup}`} checked={timing.days.includes(index)}
            onChange={e => change({ ...timing, days: timing.preset === "weekly" ? [index]
              : e.target.checked ? [...timing.days, index] : timing.days.filter(day => day !== index) })} /> {day}
        </label>)}
      </fieldset>}
      <details className="advanced-settings"><summary>Advanced timing</summary>
        <label className="app-field"><span>Samples per engine combination per slot</span>
          <input type="number" min={1} max={10} value={timing.repetitions} onChange={e => change({ ...timing, repetitions: Math.max(1, Math.min(10, Math.floor(Number(e.target.value) || 1))) })} />
        </label>
        {timing.times.slice(1).map((time, index) => <div className="app-inline-form" key={index}>
          <input type="time" aria-label={`Additional time ${index + 1}`} value={time} onChange={e => setTime(index + 1, e.target.value)} />
          <Button type="button" variant="ghost" onClick={() => change({ ...timing, times: timing.times.filter((_, i) => i !== index + 1) })}>Remove time</Button>
        </div>)}
        <Button type="button" variant="outline" disabled={timing.times.length >= 8} onClick={() => change({ ...timing, times: [...timing.times, "17:00"] })}>Add a time</Button>
        <label className="app-field"><span>Batch name (optional)</span><input maxLength={100} value={timing.name} onChange={e => change({ ...timing, name: e.target.value })} /></label>
      </details>
    </details>
    <p className="data-note">{projection.weekly} checks per scheduled week{projection.next && ` · First occurrence ${projection.next}`}</p>
  </div>;
}
