import { Dialog } from "radix-ui";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MonitoringEditor, monitoringProjection, type MonitoringTiming } from "./monitoring-timing";

export type Readiness = {
  workspace: { id: string; name: string };
  brands: { id: string; name: string }[];
  combinations: {id: string; engine: string; location_name: string; language_code: string; brand_id: string | null;
    eligibility_error: string | null; paused_schedules: {id: string; weekly_checks: number}[]; monitoring: "none" | "active" | "paused"}[];
  available: number;
  requested: number;
  can_run: boolean;
  can_schedule: boolean;
  provider_connected: boolean;
};

export function CollectionDetails({ workspace, workspaceId, brands, locales, provider, available, org }: {
  workspace: string; workspaceId: string; brands: string[]; locales: string[]; provider: boolean; available?: number; org: string;
}) {
  return <div className="form-stack">
    <p><strong>{workspace}</strong> · {locales.join(" · ")}</p>
    <p>{brands.length ? `Workspace brands measured: ${brands.join(", ")}.`
      : "This workspace has no tracked brands. Collection can capture answers and sources. Brands added later will have no historical mention metrics for these checks."}</p>
    <p>{provider ? "DataForSEO connected." : "Connect DataForSEO before starting collection."}
      {available !== undefined && ` ${available.toLocaleString()} checks available this month.`}</p>
    <p className="data-note">Provider charges apply separately for each check.</p>
    <div className="app-inline-form">
      <Link target="_blank" rel="noopener" to="/app" search={{ org, tab: "settings" }}>Provider settings</Link>
      <Link target="_blank" rel="noopener" to="/app" search={{ org, workspace: workspaceId, tab: "brands" }}>Workspace brands</Link>
    </div>
  </div>;
}

export function CollectionReview({ data, type, org, engines, timing, changeTiming, busy, confirm, resume, refresh, close }: {
  data: Readiness; type: "run" | "schedule"; org: string; engines: Record<string, string>; timing: MonitoringTiming;
  changeTiming: (value: MonitoringTiming) => void; busy: boolean; confirm: (enabled: boolean, ids: string[]) => void; resume: (ids: string[]) => void; refresh: () => void; close: () => void;
}) {
  const unscheduled = data.combinations.filter(row => row.monitoring === "none" && !row.eligibility_error);
  const paused = data.combinations.filter(row => row.monitoring === "paused" && !row.eligibility_error);
  const active = data.combinations.filter(row => row.monitoring === "active" && !row.eligibility_error);
  const ineligible = data.combinations.filter(row => row.eligibility_error);
  const pausedSchedules = paused.flatMap(row => row.paused_schedules);
  const eligibilityErrors = [...new Set(data.combinations.map(row => row.eligibility_error).filter(Boolean))];
  const runError = !data.can_run ? "Your access is read-only for collection."
    : !data.provider_connected ? "DataForSEO is required to run these prompts."
    : eligibilityErrors.length ? eligibilityErrors.join(". ")
    : data.requested > data.available ? `This selection needs ${data.requested} checks and ${data.available} are available.` : "";
  const projection = monitoringProjection(timing, unscheduled.length);
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="collection-overlay" />
      <Dialog.Content className="collection-dialog form-stack">
        <Dialog.Title>{type === "run" ? "Review collection" : "Schedule selected prompts"}</Dialog.Title>
        <Dialog.Description>{data.combinations.length} engine combinations selected.</Dialog.Description>
        <CollectionDetails workspace={data.workspace.name} workspaceId={data.workspace.id} brands={data.brands.map(b => b.name)}
          locales={[...new Set(data.combinations.map(row => `${engines[row.engine]} · ${row.location_name} · ${row.language_code}`))]}
          provider={data.provider_connected} available={data.available} org={org} />
        {data.combinations.some(row => row.brand_id) && <p className="data-note">
          Associated prompt brands: {[...new Set(data.combinations.map(row => data.brands.find(brand => brand.id === row.brand_id)?.name).filter(Boolean))].join(", ")}.
          Each check measures all tracked workspace brands.
        </p>}
        {type === "run" ? <>
          <p>{data.requested} checks now · 0 new recurring checks</p>
          {runError && <p role="alert">{runError}</p>}
          <Button disabled={busy || !!runError} onClick={() => confirm(true, data.combinations.map(row => row.id))}>Run {data.requested} checks</Button>
        </> : <>
          <p>{unscheduled.length} ready to schedule · {active.length} already active · {paused.length} paused · {ineligible.length} ineligible</p>
          {!!pausedSchedules.length && <div className="form-stack">
            <p>Resume using saved timing · {pausedSchedules.reduce((sum, row) => sum + row.weekly_checks, 0)} checks per scheduled week.</p>
            <Button variant="outline" disabled={busy || !data.can_schedule || !data.provider_connected}
              onClick={() => resume(pausedSchedules.map(row => row.id))}>Resume {pausedSchedules.length} paused schedules</Button>
          </div>}
          {!data.can_schedule && <p role="status">Your access is read-only for schedules.</p>}
          {!!eligibilityErrors.length && <p role="status">{eligibilityErrors.join(". ")}</p>}
          <MonitoringEditor timing={timing} change={changeTiming} count={unscheduled.length} />
          <p>0 checks now</p>
          <div className="form-actions">
            <Button disabled={busy || !data.can_schedule || !data.provider_connected || !unscheduled.length || !projection.valid}
              onClick={() => confirm(true, unscheduled.map(row => row.id))}>Start monitoring {unscheduled.length} combinations</Button>
            <Button variant="outline" disabled={busy || !data.can_schedule || !unscheduled.length || !projection.valid}
              onClick={() => confirm(false, unscheduled.map(row => row.id))}>Save {unscheduled.length} paused</Button>
          </div>
        </>}
        <Button type="button" variant="outline" disabled={busy} onClick={refresh}>Check readiness again</Button>
        <Dialog.Close asChild><Button type="button" variant="ghost" disabled={busy}>Cancel</Button></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
