import { useId } from "react";
import { Button } from "@/components/ui/button";
import { parseSampleCount, sampleCountError, scheduleDays, type SchedulePreset } from "@/lib/schedule-settings";
import { nextScheduleSlot } from "@/lib/schedule-slots";

export type MonitoringTiming = {
  name: string;
  preset: SchedulePreset;
  days: number[];
  times: string[];
  timezone: string;
  repetitions: string;
};

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const presets = { daily: "Daily", weekly: "Weekly", mwf: "Monday, Wednesday, Friday", custom: "Custom weekdays" };

export function defaultMonitoringTiming(): MonitoringTiming {
  return { name: "", preset: "weekly", days: [1], times: ["09:00"], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", repetitions: "1" };
}

export function monitoringProjection(timing: MonitoringTiming, count: number) {
  const days = scheduleDays(timing.preset, timing.days);
  const times = [...new Set(timing.times)].sort();
  const repetitions = parseSampleCount(timing.repetitions);
  const valid = repetitions !== undefined && !!days.length && times.every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
  const next = valid ? nextScheduleSlot({ days, times, timezone: timing.timezone }, Date.now()) : null;
  return {
    valid, repetitions, weekly: valid ? count * days.length * times.length * repetitions : null,
    next: next === null ? "" : new Intl.DateTimeFormat(undefined, {
      dateStyle: "full", timeStyle: "short", timeZone: timing.timezone,
    }).format(next) + " (" + timing.timezone + ")",
  };
}

export function MonitoringEditor({ timing, change, count, expanded = false }: {
  timing: MonitoringTiming; change: (value: MonitoringTiming) => void; count: number; expanded?: boolean;
}) {
  const weekdayGroup = useId();
  const repetitionsHintId = `${weekdayGroup}-samples`;
  const projection = monitoringProjection(timing, count);
  const setTime = (index: number, value: string) => change({ ...timing, times: timing.times.map((time, i) => i === index ? value : time) });
  return <div className="form-stack">
    <details className="advanced-settings" open={expanded || undefined}>
      <summary className="break-words">Schedule timing · {presets[timing.preset]}{timing.preset === "weekly" && timing.days.length ? ` on ${weekdays[timing.days[0]]}` : ""}
        {timing.times[0] ? ` at ${timing.times[0]}` : ""} · {timing.timezone}
        {timing.times.length > 1 && ` · ${timing.times.length} time slots`}
        {projection.repetitions !== undefined && projection.repetitions > 1 && ` · ${projection.repetitions} samples per slot`}</summary>
      <div className="form-stack">
        <div className="form-grid">
          <label className="app-field"><span id={`${weekdayGroup}-cadence`}>Cadence</span><select aria-labelledby={`${weekdayGroup}-cadence`} value={timing.preset} onChange={e => change({ ...timing, preset: e.target.value as SchedulePreset, days: [timing.days[0] ?? 1] })}>
            {Object.entries(presets).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>
          <label className="app-field"><span>Local time</span><input type="time" value={timing.times[0]} onChange={e => setTime(0, e.target.value)} /></label>
          <label className="app-field"><span id={`${weekdayGroup}-timezone`}>Timezone</span><select aria-labelledby={`${weekdayGroup}-timezone`} value={timing.timezone} onChange={e => change({ ...timing, timezone: e.target.value })}>
            {[...new Set([timing.timezone, "UTC", ...Intl.supportedValuesOf("timeZone")])].sort().map(zone => <option key={zone}>{zone}</option>)}
          </select></label>
        </div>
        {["weekly", "custom"].includes(timing.preset) && <fieldset><legend>Weekdays</legend>
          <div className="form-actions">
            {weekdays.map((day, index) => <label key={day} className="check-field">
              <input type={timing.preset === "weekly" ? "radio" : "checkbox"} name={`monitoring-weekday-${weekdayGroup}`} checked={timing.days.includes(index)}
                onChange={e => change({ ...timing, days: timing.preset === "weekly" ? [index]
                  : e.target.checked ? [...timing.days, index] : timing.days.filter(day => day !== index) })} /> {day}
            </label>)}
          </div>
        </fieldset>}
        <details className="advanced-settings">
          <summary>Advanced timing</summary>
          <div className="form-stack">
            <div className="form-grid">
              <label className="app-field"><span>Samples per engine combination per slot</span>
                <input inputMode="numeric" value={timing.repetitions}
                  aria-invalid={projection.repetitions === undefined}
                  aria-describedby={projection.repetitions === undefined ? repetitionsHintId : undefined}
                  onChange={e => change({ ...timing, repetitions: e.target.value })} />
                {projection.repetitions === undefined && <small id={repetitionsHintId}>{sampleCountError}</small>}
              </label>
              <label className="app-field"><span>Batch name (optional)</span><input maxLength={100} value={timing.name} onChange={e => change({ ...timing, name: e.target.value })} /></label>
            </div>
            {timing.times.slice(1).map((time, index) => <div className="app-inline-form" key={index}>
              <label className="app-field"><span>Additional time {index + 1}</span>
                <input type="time" value={time} onChange={e => setTime(index + 1, e.target.value)} />
              </label>
              <Button type="button" variant="ghost" onClick={() => change({ ...timing, times: timing.times.filter((_, i) => i !== index + 1) })}>Remove time</Button>
            </div>)}
            <Button type="button" variant="outline" disabled={timing.times.length >= 8} onClick={() => change({ ...timing, times: [...timing.times, "17:00"] })}>Add a time</Button>
          </div>
        </details>
      </div>
    </details>
    {projection.weekly !== null && <p className="data-note">{projection.weekly} checks per scheduled week{projection.next && ` · First occurrence ${projection.next}`}</p>}
  </div>;
}
