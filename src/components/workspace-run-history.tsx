import { analyticsQuery, type AnalyticsScope, type AnswerMetric } from "@/lib/analytics-filters";
import { collectionVariantLabel } from "@/lib/collection-labels";
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
type HistoryPrompt = { question: string; engine?: string; workspace: string };

function includeRunPrompts(known: Map<string, HistoryPrompt>, runs: Item[]) {
  const prompts = new Map(known);
  for (const run of runs) {
    const recorded = { question: run.prompt_text, engine: run.config?.engine, workspace: run.workspace_id };
    if (!prompts.has(run.prompt_id)) prompts.set(run.prompt_id, recorded);
  }
  return prompts;
}
const statuses = [
  ["queued", "Queued"], ["submitting", "Submitting"], ["submitted", "Waiting for provider"],
  ["succeeded", "Completed"], ["failed", "Failed"], ["uncertain", "Uncertain"],
];

const metricLabels: Record<AnswerMetric, string> = {
  eligible: "Eligible AI answers", coverage: "Question coverage", brand: "Eligible answers for tracked brands",
  mention: "Tracked brand mentions", citation: "Tracked brand website citations",
  compare_mention: "Comparison brand mentions", compare_citation: "Comparison brand website citations",
};

export function RunStatus({ value }: { value: string }) {
  return <Badge variant="outline" className={"run-status status-" + value}>{value}</Badge>;
}

export function WorkspaceRunHistory({ org, workspace, workspaceName, workspaceNames, runPrompt, prompts, brands, engines, request, refresh, canWrite, scope, metric, trendMetric, evidenceDay, researchType, researchValue, filters, onChange }: {
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
  canWrite: boolean;
  scope: AnalyticsScope;
  metric?: AnswerMetric;
  trendMetric?: AppSearch["trendMetric"];
  evidenceDay?: string;
  researchType?: ResearchType;
  researchValue?: string;
  filters: Pick<AppSearch, "q" | "status" | "brand" | "outcome" | "run">;
  onChange: (patch: Partial<AppSearch>) => void;
}) {
  const { q: keyword = "", status = "", brand = "", outcome } = filters;
  const engine = scope.engine ?? "";
  const [page, setPage] = useState<RunPage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const query = analyticsQuery(evidenceDay ? { ...scope, from: evidenceDay, to: evidenceDay } : scope, workspace);
  if (!metric || metric === "eligible" || metric === "coverage") query.delete("compare_brand");
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
  const narrowed = Boolean(keyword.trim() || status || brand || outcome || runPrompt || metric || researchType || Object.values(scope).some(Boolean));
  const [runPrompts, setRunPrompts] = useState(new Map<string, HistoryPrompt>());
  const promptOptions = new Map(runPrompts);
  for (const prompt of prompts) {
    promptOptions.set(prompt.id, {
      engine: prompt.engine, workspace: prompt.workspace_id, question: prompt.text,
    });
  }
  const optionLabels = new Map<string, string>();
  const duplicateLabels = new Map<string, number>();
  for (const [id, { engine, workspace, question }] of promptOptions) {
    const scopeLabel = collectionVariantLabel(engine, workspaceNames[workspace] ?? "", engines);
    const shortQuestion = question.length > 95 ? question.slice(0, 94) + "…" : question;
    const label = `${scopeLabel} · ${shortQuestion}`;
    optionLabels.set(id, label);
    duplicateLabels.set(label, (duplicateLabels.get(label) ?? 0) + 1);
  }
  if (runPrompt && !optionLabels.has(runPrompt)) optionLabels.set(runPrompt, "Selected prompt variant");
  const firstRun = current && !current.error && !current.runs.length && !narrowed;
  useEffect(() => {
    let canceled = false;
    setPage(null);
    const timer = window.setTimeout(() => {
      request(path).then(data => {
        if (!canceled) {
          setPage({ key: path, runs: data.runs, next_before: data.next_before, next_before_id: data.next_before_id });
          setRunPrompts(known => includeRunPrompts(known, data.runs));
        }
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
      setRunPrompts(known => includeRunPrompts(known, data.runs));
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
        {trendMetric && !filters.run && <Link className="small-link" to="/app" search={{ ...scope, org, workspace: workspace || "all", tab: "overview", trendMetric }}>Back to Overview</Link>}
        {(!!current?.runs.length || (trendMetric && current && !current.error)) && <a className="small-link" href={"/api/v1/export?" + new URLSearchParams({ ...Object.fromEntries(query), org })}
          title="Export up to 1,000 matching runs">
          <Download size={14} /> Export CSV
        </a>}
      </div>
      {narrowed && <div className="app-inline-form" aria-label="Active filters">
        {Object.entries({
          engine, q: keyword, status, outcome, brand, runPrompt, metric, researchValue,
          set: scope.set, tags: scope.tags, location: scope.location, from: scope.from, to: scope.to, trackedBrand: scope.trackedBrand,
          compareBrand: query.get("compare_brand"), evidenceDay,
        }).filter(([, value]) => value).map(([key, value]) => {
          const labels: Record<string, string> = { q: "Search", runPrompt: "Prompt variant", trackedBrand: "Tracked brand", compareBrand: "Comparison brand", evidenceDay: "Evidence day", researchValue: "Research", set: "Prompt set" };
          const displayed = key === "engine" ? engines[value!] : key === "brand" || key === "trackedBrand" || key === "compareBrand"
            ? brands.find(item => item.id === value)?.name ?? value : key === "runPrompt" ? optionLabels.get(value!) : key === "metric" && metric ? metricLabels[metric] : value;
          return <Button type="button" variant="outline" size="sm" key={key}
            onClick={() => onChange({ [key]: undefined, ...(key === "researchValue" ? { researchType: undefined } : {}),
              ...(key === "trackedBrand" ? { compareBrand: undefined } : {}),
              ...((key === "trackedBrand" && metric && metric !== "eligible" && metric !== "coverage") ||
                (key === "compareBrand" && metric?.startsWith("compare_")) ? { metric: undefined } : {}) })}>
            {labels[key] ?? key} · {displayed} ×
          </Button>;
        })}
        <Link to="/app" search={{ org, workspace: workspace || "all", tab: "runs" }}>Clear filters</Link>
      </div>}
      {!firstRun && <div className="form-grid prompt-filters">
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
        <label className="app-field"><span>Prompt variant</span>
          <select value={runPrompt ?? ""} onChange={e => onChange({ runPrompt: e.target.value || undefined })}>
            <option value="">All prompt variants</option>
            {[...optionLabels].map(([id, label]) => <option key={id} value={id}>
              {(duplicateLabels.get(label) ?? 0) > 1 ? `${label} · ${id}` : label}
            </option>)}
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
      </div>}
      {!current && <p role="status">Loading run history…</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {firstRun && <div className="form-stack">
        <h3>No runs in searchable history</h3>
        <p className="data-note">{canWrite
          ? "Save or select questions in Prompts, choose engines, and start a collection. Runs appear here as soon as they’re queued."
          : "Runs appear here once a teammate starts a collection."}</p>
        {canWrite && <div><Button asChild>
          <Link to="/app" search={{ org, workspace: workspace || "all", tab: "prompts" }}>Go to Prompts</Link>
        </Button></div>}
      </div>}
      {narrowed && current && !current.error && !current.runs.length &&
        <p className="data-note">No runs match these filters. Try a different keyword or clear a filter.</p>}
      {current?.runs.map(run => (
        <Link key={run.id} className="run-row" to="/app" search={{ ...scope, org, workspace: workspace || "all", tab: "runs", run: run.id, runPrompt, metric, trendMetric, evidenceDay, q: filters.q, status: filters.status, outcome, brand, researchType, researchValue }}>
          <span><strong>{run.prompt_text}</strong><small>
            {collectionVariantLabel(run.config?.engine, workspaceNames[run.workspace_id] ?? "", engines)}
            {" · "}{new Date(run.created_at).toLocaleString()} · {run.config?.mode}
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
