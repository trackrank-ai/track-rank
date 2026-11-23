import { Link } from "@tanstack/react-router";
import { scheduleCadence } from "@/lib/collection-labels";
import type { AppSearch } from "@/lib/app-location";

export type MonitoredVariant = {
  id: string;
  engine: string;
  location_name: string;
  language_code: string;
  schedules: (Parameters<typeof scheduleCadence>[0] & { id: string; enabled: number })[];
  tracking_sets: { id: string; name: string }[];
};

export function QuestionMonitoring({ variants, engines, scope }: {
  variants: MonitoredVariant[];
  engines: Record<string, string>;
  scope: Pick<AppSearch, "org" | "workspace" | "set" | "trackingView">;
}) {
  return <section className="form-stack" aria-label="Question monitoring">
    <h2>Monitoring</h2>
    {variants.map(variant => <div key={variant.id}>
      <h3>{engines[variant.engine]} · {variant.location_name} · {variant.language_code}</h3>
      {variant.schedules.length ? <ul>{variant.schedules.map(schedule => <li key={schedule.id}>
        <Link className="small-link" to="/app" search={{ ...scope, tab: "schedules", scheduleId: schedule.id }}>
          {schedule.enabled ? "Active schedule" : "Paused schedule"} · {scheduleCadence(schedule)}
        </Link>
      </li>)}</ul> : <p className="data-note">No schedule</p>}
      <p className="data-note">{variant.tracking_sets.length ? <>Tracking sets · {variant.tracking_sets.map((set, index) =>
        <span key={set.id}>{index > 0 && ", "}<Link to="/app" search={{ org: scope.org, workspace: scope.workspace,
          tab: "tracking", set: set.id, trackingView: "questions" }}>{set.name}</Link></span>)}</> : "No tracking sets"}</p>
    </div>)}
  </section>;
}
