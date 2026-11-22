import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PromptSet } from "@/components/prompt-sets";
import type { AppSearch } from "@/lib/app-location";
import "./tracking-sets.css";

export type TrackingSet = PromptSet & {
  question_count: number;
  engines: string[];
  scheduled_count: number;
  paused_count: number;
  unscheduled_count: number;
  has_runs: boolean;
  last_completed_at: number | null;
  next_scheduled_at: number | null;
};

export const trackingTabs = [
  ["overview", "Overview"],
  ["questions", "Questions"],
  ["answers", "Answers"],
  ["settings", "Settings"],
] as const;

function CheckTime({ value, fallback }: { value: number | null; fallback: string }) {
  if (value === null) return fallback;
  const time = new Date(value);
  return <time dateTime={time.toISOString()}>{time.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>;
}

function SetSummary({ set }: { set: TrackingSet }) {
  return <dl className="tracking-summary">
    <div><dt>Variants</dt><dd>{set.member_count.toLocaleString()}</dd></div>
    <div><dt>Monitoring</dt><dd>
      {set.scheduled_count.toLocaleString()} scheduled · {set.paused_count.toLocaleString()} paused · {set.unscheduled_count.toLocaleString()} unscheduled
    </dd></div>
    <div><dt>Last completed check</dt><dd><CheckTime value={set.last_completed_at} fallback="None yet" /></dd></div>
    <div><dt>Next scheduled check</dt><dd><CheckTime value={set.next_scheduled_at} fallback="None scheduled" /></dd></div>
  </dl>;
}

function setContext(org: string, set: TrackingSet): AppSearch {
  return { org, workspace: set.workspace_id, set: set.id };
}

export function TrackingSetList({ org, workspace, workspaceName, workspaceNames, sets, engines, canWrite, error }: {
  org: string;
  workspace: string;
  workspaceName: string;
  workspaceNames: Record<string, string>;
  sets?: TrackingSet[];
  engines: Record<string, string>;
  canWrite: boolean;
  error?: string;
}) {
  return <section className="form-stack">
    <div className="app-page-heading">
      <div><h1>Tracking</h1><p>{workspaceName}</p></div>
      {canWrite && <Button asChild>
        <Link to="/app" search={{ org, workspace, tab: "prompts", promptView: "create", setupFrom: "tracking" }}>
          <Plus size={16} aria-hidden /> Create tracking set
        </Link>
      </Button>}
    </div>
    {error ? <p role="alert">{error}</p> : !sets ? <p role="status">Loading tracking sets…</p> : sets.length ? (
      <ul className="tracking-list">
        {sets.map(set => <li key={set.id}>
          <div className="panel-title">
            <div>
              <h2><Link to="/app" search={{ ...setContext(org, set), tab: "tracking", trackingView: "overview" }}>{set.name}</Link></h2>
              <p>{workspaceNames[set.workspace_id]} · {set.question_count.toLocaleString()} {set.question_count === 1 ? "question" : "questions"}
                {set.engines.length > 0 && <> · {set.engines.map(engine => engines[engine] ?? engine).join(", ")}</>}
              </p>
            </div>
            <div className="question-row-actions">
              <Button size="sm" variant="outline" asChild>
                <Link to="/app" search={{ ...setContext(org, set), tab: "tracking", trackingView: "answers" }}
                  aria-label={`Answers for ${set.name}`}>Answers</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to="/app" search={{ ...setContext(org, set), tab: "tracking", trackingView: "settings" }}
                  aria-label={`Settings for ${set.name}`}>Settings</Link>
              </Button>
            </div>
          </div>
          <SetSummary set={set} />
        </li>)}
      </ul>
    ) : <div className="tracking-empty">
      <h2>No tracking sets yet</h2>
      <p>{canWrite ? "Create a named set to group questions and review their monitoring and recorded answers together." : "Tracking sets in this workspace will appear here."}</p>
      {canWrite && <Link className="small-link" to="/app" search={{ org, workspace, tab: "prompts" }}>Choose from saved prompts</Link>}
    </div>}
  </section>;
}

export function TrackingSetDetail({ org, set, search, workspaceName, engines, children }: {
  org: string;
  set: TrackingSet;
  search: AppSearch;
  workspaceName: string;
  engines: Record<string, string>;
  children: ReactNode;
}) {
  const view = search.trackingView ?? "overview";
  return <section className="form-stack tracking-detail">
    <div><Link className="small-link" to="/app" search={{ org, workspace: set.workspace_id, tab: "tracking" }}>Back to tracking sets</Link></div>
    <div className="app-page-heading">
      <div><h1>{set.name}</h1><p>{workspaceName}{set.engines.length > 0 && <> · {set.engines.map(engine => engines[engine] ?? engine).join(", ")}</>}</p></div>
    </div>
    <nav className="tracking-tabs" aria-label="Tracking set views">
      {trackingTabs.map(([id, label]) => <Link key={id} to="/app"
        search={{ ...setContext(org, set), tab: "tracking", trackingView: id, from: search.from, to: search.to,
          engine: search.engine, trackedBrand: search.trackedBrand, compareBrand: search.compareBrand, location: search.location,
          tags: search.tags, trendMetric: search.trendMetric }}
        aria-current={view === id ? "page" : undefined}>{label}</Link>)}
    </nav>
    {view === "overview" && <SetSummary set={set} />}
    {children}
  </section>;
}

export function TrackingSetEmptyReport({ org, set, canWrite }: {
  org: string;
  set: TrackingSet;
  canWrite: boolean;
}) {
  const context = setContext(org, set);
  if (set.scheduled_count && !set.has_runs) return <div>
    <p>No recorded checks in this view yet. Enabled schedules collect at their next due time.</p>
    <Link className="small-link" to="/app" search={{ ...context, tab: "schedules", trackingView: "overview" }}>View schedules</Link>
  </div>;
  return <div>
    <p>{set.has_runs ? "No collections match these report filters."
      : set.member_count ? "No recorded checks in this view yet."
      : "Add questions to start tracking this set."}</p>
    <Link className="small-link" to="/app" search={{ ...context, tab: "tracking", trackingView: "questions" }}>View questions</Link>
    {canWrite && set.member_count > 0 && !set.has_runs && <> · <Link className="small-link" to="/app"
      search={{ ...context, tab: "prompts", trackingView: "overview" }}>Review collection options</Link></>}
  </div>;
}

export function TrackingSetSettings({ org, set, canWrite, request, onChange, onDelete }: {
  org: string;
  set: TrackingSet;
  canWrite: boolean;
  request: (path: string, method: string, data?: unknown) => Promise<unknown>;
  onChange: () => void;
  onDelete: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error?: boolean; text: string }>();
  const context = setContext(org, set);
  async function mutate(method: "PATCH" | "DELETE", name?: string) {
    setBusy(true);
    setFeedback(undefined);
    try {
      await request(`/prompt-sets/${set.id}`, method, name ? { name } : undefined);
      if (method === "DELETE") onDelete();
      else setFeedback({ text: "Tracking set renamed." });
      onChange();
    } catch (error) {
      setFeedback({ error: true, text: error instanceof Error ? error.message : "Unable to update this tracking set." });
    } finally {
      setBusy(false);
    }
  }
  return <div className="form-stack tracking-empty">
    <h2>Tracking set settings</h2>
    <div className="form-stack">
      {canWrite && <form className="app-inline-form" onSubmit={event => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
        if (name) void mutate("PATCH", name);
      }}>
        <label className="app-field"><span>Set name</span><input name="name" key={set.name} defaultValue={set.name} maxLength={100} required /></label>
        <Button disabled={busy} size="sm">Rename set</Button>
      </form>}
      <div className="question-row-actions">
        <Button variant="outline" size="sm" asChild><Link to="/app"
          search={{ ...context, tab: "schedules", trackingView: "settings" }}>View schedules</Link></Button>
        <Button variant="outline" size="sm" asChild><Link to="/app"
          search={{ ...context, tab: "prompts", trackingView: "settings" }}>Open set in Prompts</Link></Button>
      </div>
      <p className="data-note">Schedules and engine settings belong to prompt variants. Changes apply wherever those variants are used.</p>
      {canWrite && <div>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => {
          if (confirm(`Delete ${set.name}? Its prompts, schedules and recorded answers will stay available.`)) void mutate("DELETE");
        }}>Delete set</Button>
      </div>}
      {feedback && <p role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
    </div>
  </div>;
}
