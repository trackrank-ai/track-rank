import { analyticsQuery, type AnalyticsScope, type AnswerMetric } from "@/lib/analytics-filters";
import { collectionTimestamp, collectionVariantLabel } from "@/lib/collection-labels";
import type { AppSearch, ResearchType } from "@/lib/app-location";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { AnswerPreview } from "./answer-preview";
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
  counts?: Record<string, number>;
  question?: { prompt_text: string; engine: string; workspace_id: string };
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
  return <Badge variant="outline" className={"run-status status-" + value}>{statuses.find(([id]) => id === value)?.[1] ?? value}</Badge>;
}

export function WorkspaceRunHistory({ org, workspace, workspaceName, workspaceNames, runPrompt, prompts, brands, engines, request, refresh, canWrite, scope, metric, trendMetric, evidenceDay, researchType, researchValue, filters, onChange, restoreFocus, historyLink, recordLink, backLink, primaryHeading = false, lockSet = false }: {
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
  filters: Pick<AppSearch, "q" | "status" | "brand" | "outcome" | "run" | "reportQuestion" | "reportEngine" | "sourceQuestion">;
  lockSet?: boolean;
  historyLink?: (patch: Partial<AppSearch>) => AppSearch;
  primaryHeading?: boolean;
  restoreFocus?: (link: HTMLAnchorElement | null) => void;
  recordLink?: (run: string) => AppSearch;
  backLink?: AppSearch;
  onChange: (patch: Partial<AppSearch>) => void;
}) {
  const { q: keyword = "", status = "", brand = "", outcome } = filters;
  const engine = scope.engine ?? "";
  const [page, setPage] = useState<RunPage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const query = analyticsQuery(evidenceDay ? { ...scope, from: evidenceDay, to: evidenceDay } : scope, workspace);
  if (!scope.overlap && (!metric || metric === "eligible" || metric === "coverage")) query.delete("compare_brand");
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
  if (filters.reportQuestion) query.set("report_evidence_run", filters.reportQuestion);
  if (filters.sourceQuestion && researchType) {
    query.set("report_evidence_run", filters.sourceQuestion);
    query.set("report_question_all_engines", "true");
  }
  if (metric) query.set("include_report_counts", "true");
  if (runPrompt) query.set("prompt_id", runPrompt);
  const path = "/runs?" + query;
  const numerator = metric?.endsWith("mention") || metric?.endsWith("citation");
  const current = page?.key === path ? page : null;
  const narrowed = Boolean(keyword.trim() || status || brand || outcome || runPrompt || filters.reportQuestion || metric || researchType || Object.values(scope).some(Boolean));
  const [runPrompts, setRunPrompts] = useState(new Map<string, HistoryPrompt>());
  const promptOptions = new Map(runPrompts);
  for (const prompt of prompts) {
    promptOptions.set(prompt.id, {
      engine: prompt.engine, workspace: prompt.workspace_id, question: prompt.text,
    });
  }
  const optionLabels = new Map<string, string>();
  const duplicateLabels = new Map<string, number>();
  const selectedEngine = filters.reportQuestion ? filters.reportEngine : engine;
  for (const [id, prompt] of promptOptions) {
    if (selectedEngine && prompt.engine !== selectedEngine) continue;
    if (workspace && workspace !== "all" && workspace !== prompt.workspace) continue;
    const { engine, workspace: variantWorkspace, question } = prompt;
    const scopeLabel = collectionVariantLabel(engine, workspaceNames[variantWorkspace] ?? "", engines);
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
          setPage({ key: path, runs: data.runs, next_before: data.next_before, next_before_id: data.next_before_id,
            counts: data.report_counts, question: data.recorded_question });
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
        ...current, runs: [...current.runs, ...data.runs], next_before: data.next_before, next_before_id: data.next_before_id,
      } : previous);
    } catch (error) {
      setPage(previous => previous === current ? {
        ...current, error: error instanceof Error ? error.message : "Unable to load more runs",
      } : previous);
    } finally {
      setLoadingMore(false);
    }
  }

  const overviewLink = backLink ?? (trendMetric || metric ? { ...scope, org, workspace: workspace || "all", tab: "overview" as const, trendMetric } : undefined);
  const metricBrand = metric?.startsWith("compare_") ? scope.compareBrand : scope.trackedBrand;
  const metricBrandName = brands.find(item => item.id === metricBrand)?.name ??
    (metric?.startsWith("compare_") ? "the comparison brand" : "the tracked brand");
  let emptyMetricMessage = "No eligible AI answers match these filters.";
  if (metric === "brand" || numerator) {
    emptyMetricMessage = scope.compareBrand
      ? "No eligible answers in this view tracked both brands."
      : "No eligible answers in this view tracked the selected brand.";
  }
  if (numerator && current?.counts?.eligible) {
    emptyMetricMessage = metric?.endsWith("citation")
      ? `Eligible answers match these filters. None cited ${metricBrandName}’s website.`
      : `Eligible answers match these filters. None mentioned ${metricBrandName}.`;
  }

  const historySearch: AppSearch = {
    ...scope, org, workspace: workspace || "all", tab: "runs", runPrompt, metric, trendMetric, evidenceDay,
    q: filters.q, status: filters.status, outcome, brand, researchType, researchValue,
    reportQuestion: filters.reportQuestion, reportEngine: filters.reportEngine,
  };
  const report = !!(metric || researchType);
  const counts = current?.counts;
  const citation = metric?.endsWith("citation") || (metric === "brand" && trendMetric === "citation");
  const outcomeLabel = citation ? "cited" : "mentioned";
  const field = citation ? "citations" : "mentions";
  const reportEngine = current?.question?.engine || scope.engine;
  const heading = current?.question?.prompt_text || researchValue || (report ? "Matching answers" : "Collection history");
  const clearLink = historyLink?.({}) ?? { org, workspace: workspace || "all", tab: "runs" as const };
  const filterEditor = <>
      {narrowed && <div className="app-inline-form history-chips" aria-label="Active filters">
        {Object.entries({
          reportQuestion: filters.reportQuestion ? `Recorded question · ${engines[filters.reportEngine ?? ""] ?? "Recorded engine"}` : undefined,
          engine, q: keyword, status, outcome, brand, runPrompt, metric, researchValue,
          set: lockSet ? undefined : scope.set, tags: scope.tags, location: scope.location, from: scope.from, to: scope.to, trackedBrand: scope.trackedBrand,
          compareBrand: query.get("compare_brand"), evidenceDay,
        }).filter(([, value]) => value).map(([key, value]) => {
          const labels: Record<string, string> = { reportQuestion: "Question breakdown", q: "Search", runPrompt: "Prompt variant", trackedBrand: "Tracked brand", compareBrand: "Comparison brand", evidenceDay: "Evidence day", researchValue: "Research", set: "Tracking set" };
          const displayed = key === "engine" ? engines[value!] : key === "brand" || key === "trackedBrand" || key === "compareBrand"
            ? brands.find(item => item.id === value)?.name ?? "Historical brand" : key === "runPrompt" ? optionLabels.get(value!) : key === "status" ? statuses.find(([id]) => id === value)?.[1] ?? value : key === "metric" && metric ? metricLabels[metric] : value;
          return <Button type="button" variant="outline" size="sm" key={key}
            onClick={() => onChange({ [key]: undefined, ...(key === "researchValue" ? { researchType: undefined } : {}),
              ...(key === "trackedBrand" ? { compareBrand: undefined } : {}),
              ...((key === "trackedBrand" && metric && metric !== "eligible" && metric !== "coverage") ||
                (key === "compareBrand" && metric?.startsWith("compare_")) ? { metric: undefined } : {}) })}>
            {labels[key] ?? key} · {displayed} ×
          </Button>;
        })}
        <Link to="/app" search={clearLink}>Clear filters</Link>
      </div>}
      {!firstRun && <div className="form-grid prompt-filters">
        <label className="app-field"><span>Search run history</span>
          <input type="search" value={keyword} onChange={e => onChange({ q: e.target.value || undefined })} maxLength={200}
            placeholder="Search prompt text or answers" />
        </label>
        <label className="app-field"><span>Engine</span>
          <select value={filters.reportQuestion ? filters.reportEngine ?? "" : engine} disabled={!!filters.reportQuestion} onChange={e => onChange({ engine: (e.target.value || undefined) as AppSearch["engine"], runPrompt: e.target.value && runPrompt && promptOptions.get(runPrompt)?.engine !== e.target.value ? undefined : runPrompt })}>
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
  </>;
  return (
    <Card className="history-results" tabIndex={-1}><CardContent>
      <div className="panel-title">
        <div>
          {primaryHeading ? <h1>{heading}</h1> : <h2>{heading}</h2>}
          {report ? <p>{current?.question ? workspaceNames[current.question.workspace_id] ?? workspaceName : workspaceName}
            {reportEngine && ` · ${engines[reportEngine] ?? "Recorded engine"}`}
            {evidenceDay ? ` · ${evidenceDay} UTC` : scope.from && scope.to ? ` · ${scope.from} to ${scope.to} UTC` : ""}</p>
            : <p>{workspace ? `Runs recorded in ${workspaceName}.` : "Runs across all workspaces."}</p>}
          {counts && (counts.eligible === 0 ? <p>No eligible answers in this scope.</p> : counts[field] === undefined ? <p>{counts.eligible} eligible answers</p> :
            [[scope.trackedBrand, counts[field]], [scope.compareBrand, counts["compare_" + field]]].map(([id, count]) =>
              typeof id === "string" && typeof count === "number" && <p key={id}><strong>{count} of {counts.eligible}</strong> eligible answers {outcomeLabel} {brands.find(brand => brand.id === id)?.name ?? "the recorded brand"}{citation && "’s website"}</p>))}
        </div>
        {overviewLink && !filters.run && <Link className="small-link" to="/app" search={overviewLink}>{backLink ? "Back to tracking overview" : "Back to Overview"}</Link>}
        {(!!current?.runs.length || (trendMetric && current && !current.error)) && <a className="small-link" href={"/api/v1/export?" + new URLSearchParams({ ...Object.fromEntries(query), org })}
          title="Export up to 1,000 matching runs">
          <Download size={14} /> Export CSV
        </a>}
      </div>
      {report ? <details className="history-disclosure"><summary>Report filters</summary>{filterEditor}</details> : filterEditor}
      {!current && <p role="status">Loading run history…</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {firstRun && <div className="form-stack">
        <h3>No runs in searchable history</h3>
        <p className="data-note">{canWrite
          ? "Save or select questions in Prompts, choose engines, and start a collection. Runs appear here as soon as they’re queued."
          : "Runs appear here once a teammate starts a collection."}</p>
        {canWrite && <div><Button asChild>
          <Link to="/app" search={historyLink?.({}) ?? { org, workspace: workspace || "all", tab: "prompts" }}>{historyLink ? "Review tracking answers" : "Go to Prompts"}</Link>
        </Button></div>}
      </div>}
      {narrowed && current && !current.error && !current.runs.length && (metric
        ? <div className="form-stack">
          <p className="data-note">{emptyMetricMessage}</p>
          <div className="form-actions">
            {(numerator && !!current.counts?.eligible) && <Button size="sm" variant="outline" asChild>
              <Link to="/app" search={historyLink?.({ metric: "brand" }) ?? { ...historySearch, metric: "brand" }}>View eligible answers</Link>
            </Button>}
            {overviewLink && <Button size="sm" variant="outline" asChild>
              <Link to="/app" search={overviewLink}>Adjust report filters</Link>
            </Button>}
          </div>
        </div>
        : <p className="data-note">No runs match these filters. Try a different keyword or clear a filter.</p>)}
      {current?.runs.map(run => report ? <article key={run.id} className="history-answer" aria-current={filters.run === run.id ? "true" : undefined}>
        <Link ref={restoreFocus} data-evidence-run={run.id} className="small-link" to="/app" search={recordLink?.(run.id) ?? historyLink?.({ run: run.id }) ?? { ...historySearch, run: run.id }}>
          <strong>{current.question ? "Open " + (engines[run.config?.engine] ?? "recorded") + " answer" : run.prompt_text}</strong>
        </Link>
        <p className="data-note">{collectionVariantLabel(run.config?.engine, workspaceNames[run.workspace_id] ?? "", engines)} · {collectionTimestamp(run.created_at)} · {(run.citations ?? []).length} citations</p>
        <AnswerPreview excerpt={run.answer_excerpt} passage={run.brand_passage} />
      </article> : (
        <Link key={run.id} ref={restoreFocus} data-evidence-run={run.id} className="run-row" to="/app" search={recordLink?.(run.id) ?? historyLink?.({ run: run.id }) ?? { ...historySearch, run: run.id }}>
          <span><strong>{run.prompt_text}</strong><small>
            {collectionVariantLabel(run.config?.engine, workspaceNames[run.workspace_id] ?? "", engines)}
            {" · "}{collectionTimestamp(run.created_at)} · {run.config?.mode}
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
