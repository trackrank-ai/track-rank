import { analyticsQuery, type AnalyticsScope, type AnswerMetric } from "@/lib/analytics-filters";
import type { AppSearch, ResearchType } from "@/lib/app-location";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Item = Record<string, any>;
type RunPage = {
  key: string;
  runs: Item[];
  next_before: number | null;
  next_before_id: string | null;
  error?: string;
};
const statuses = [
  ["queued", "Queued"], ["submitting", "Submitting"], ["submitted", "Waiting for provider"],
  ["succeeded", "Completed"], ["failed", "Failed"], ["uncertain", "Uncertain"],
];

export function RunStatus({ value }: { value: string }) {
  return <Badge variant="outline" className={"run-status status-" + value}>{value}</Badge>;
}

export function WorkspaceRunHistory({ org, workspace, workspaceName, workspaceNames, runPrompt, prompts, brands, engines, request, refresh, scope, metric, researchType, researchValue, filters, onChange }: {
  org: string;
  workspace: string;
  workspaceName: string;
  workspaceNames: Record<string, string>;
  runPrompt?: string;
  prompts: Item[];
  brands: Item[];
  engines: Record<string, string>;
  request: (path: string) => Promise<Item>;
  refresh: Item[];
  scope: AnalyticsScope;
  metric?: AnswerMetric;
  researchType?: ResearchType;
  researchValue?: string;
  filters: Pick<AppSearch, "q" | "status" | "brand" | "outcome">;
  onChange: (patch: Partial<AppSearch>) => void;
}) {
  const { q: keyword = "", status = "", brand = "", outcome } = filters;
  const engine = scope.engine ?? "";
  const [page, setPage] = useState<RunPage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const query = analyticsQuery(scope, workspace);
  if (metric) query.set("metric", metric);
  if (researchType && researchValue) {
    query.set("research_type", researchType);
    query.set("research_value", researchValue);
  }
  if (keyword.trim()) query.set("q", keyword.trim());
  if (engine) query.set("engine", engine);
  if (status) query.set("status", status);
  if (outcome) query.set("outcome", outcome);
  if (brand) query.set("brand_id", brand);
  if (runPrompt) query.set("prompt_id", runPrompt);
  const path = "/runs?" + query;
  const current = page?.key === path ? page : null;
  const promptOptions = new Map<string, string>();
  for (const row of current?.runs ?? []) promptOptions.set(row.prompt_id, row.prompt_text);
  for (const prompt of prompts) promptOptions.set(prompt.id, prompt.text);
  if (runPrompt && !promptOptions.has(runPrompt)) promptOptions.set(runPrompt, "Selected saved prompt");
  useEffect(() => {
    let canceled = false;
    setPage(null);
    const timer = window.setTimeout(() => {
      request(path).then(data => {
        if (!canceled) setPage({ key: path, runs: data.runs, next_before: data.next_before, next_before_id: data.next_before_id });
      }).catch(error => {
        if (!canceled) setPage({ key: path, runs: [], next_before: null, next_before_id: null, error: error.message });
      });
    }, 180);
    return () => { canceled = true; window.clearTimeout(timer); };
  }, [path, request, refresh]);

  async function loadOlder() {
    if (!current || current.next_before === null || !current.next_before_id || loadingMore) return;
    setLoadingMore(true);
    const cursor = new URLSearchParams({ before: String(current.next_before), before_id: current.next_before_id });
    try {
      const data = await request(path + "&" + cursor);
      setPage(previous => previous === current ? {
        key: path, runs: [...current.runs, ...data.runs], next_before: data.next_before, next_before_id: data.next_before_id,
      } : previous);
    } catch (error) {
      setPage(previous => previous === current ? {
        ...current, error: error instanceof Error ? error.message : "Unable to load more runs",
      } : previous);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Card><CardContent>
      <div className="panel-title">
        <div>
          <h2>Collection history</h2>
          <p>{workspace ? `Runs recorded in ${workspaceName}.` : "Runs across all workspaces."}</p>
        </div>
        <a className="small-link" href={"/api/v1/export?" + new URLSearchParams({ ...Object.fromEntries(query), org })}
          title="Export up to 1,000 matching runs">
          <Download size={14} /> Export CSV
        </a>
      </div>
      {(Object.values(scope).some(Boolean) || keyword || status || brand || outcome || runPrompt || metric || researchType) && <div className="app-inline-form" aria-label="Active filters">
        {Object.entries({
          engine, q: keyword, status, outcome, brand, runPrompt, metric, researchValue,
          set: scope.set, tags: scope.tags, location: scope.location, from: scope.from, to: scope.to, trackedBrand: scope.trackedBrand,
        }).filter(([, value]) => value).map(([key, value]) => {
          const labels: Record<string, string> = { q: "Search", runPrompt: "Prompt", trackedBrand: "Tracked brand", researchValue: "Research", set: "Prompt set" };
          const displayed = key === "engine" ? engines[value!] : key === "brand" || key === "trackedBrand"
            ? brands.find(item => item.id === value)?.name ?? value : key === "runPrompt" ? promptOptions.get(value!) : value;
          return <Button type="button" variant="outline" size="sm" key={key}
            onClick={() => onChange({ [key]: undefined, ...(key === "researchValue" ? { researchType: undefined } : {}),
              ...(key === "trackedBrand" && metric && ["brand", "mention", "citation"].includes(metric) ? { metric: undefined } : {}) })}>
            {labels[key] ?? key} · {displayed} ×
          </Button>;
        })}
        <Link to="/app" search={{ org, workspace: workspace || "all", tab: "runs" }}>Clear filters</Link>
      </div>}
      <div className="form-grid prompt-filters">
        <label className="app-field"><span>Search run history</span>
          <input type="search" value={keyword} onChange={e => onChange({ q: e.target.value || undefined })} maxLength={200}
            placeholder="Search prompt text or answers" />
        </label>
        <label className="app-field"><span>Engine</span>
          <select value={engine} onChange={e => onChange({ engine: (e.target.value || undefined) as AppSearch["engine"] })}>
            <option value="">All engines</option>
            {Object.entries(engines).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="app-field"><span>Prompt</span>
          <select value={runPrompt ?? ""} onChange={e => onChange({ runPrompt: e.target.value || undefined })}>
            <option value="">All prompts</option>
            {[...promptOptions].map(([id, text]) => <option key={id} value={id}>{text.length > 95 ? text.slice(0, 94) + "…" : text}</option>)}
          </select>
        </label>
        <label className="app-field"><span>Brand mentioned or cited</span>
          <select value={brand} onChange={e => onChange({ brand: e.target.value || undefined })}>
            <option value="">Any brand</option>
            {brands.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="app-field"><span>Run status</span>
          <select value={status} onChange={e => onChange({ status: (e.target.value || undefined) as AppSearch["status"] })}>
            <option value="">All statuses</option>
            {statuses.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      </div>
      {!current && <p role="status">Loading run history…</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {current && !current.error && !current.runs.length && (
        <p className="data-note">{keyword || engine || status || brand || runPrompt || metric || researchType || Object.values(scope).some(Boolean)
          ? "No runs match these filters. Try a different keyword or clear a filter."
          : "No runs in this workspace yet. Go to Prompts to start a collection."}</p>
      )}
      {current?.runs.map(run => (
        <Link key={run.id} className="run-row" to="/app" search={{ ...scope, org, workspace: workspace || "all", tab: "runs", run: run.id, runPrompt, metric, researchType, researchValue }}>
          <span><strong>{run.prompt_text}</strong><small>
            {!workspace && workspaceNames[run.workspace_id] && `${workspaceNames[run.workspace_id]} · `}
            {engines[run.config?.engine]} · {new Date(run.created_at).toLocaleString()} · {run.config?.mode}
          </small></span>
          <RunStatus value={run.status} />
          <ArrowUpRight size={15} />
        </Link>
      ))}
      {!!current?.next_before_id && <Button size="sm" variant="outline" disabled={loadingMore} onClick={loadOlder}>
        {loadingMore ? "Loading…" : "Load older runs"}
      </Button>}
    </CardContent></Card>
  );
}
