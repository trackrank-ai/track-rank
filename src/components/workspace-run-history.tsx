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

export function WorkspaceRunHistory({ org, workspace, workspaceName, workspaceNames, runPrompt, prompts, brands, engines, request, refresh, onPromptChange }: {
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
  onPromptChange: (id: string) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [engine, setEngine] = useState("");
  const [status, setStatus] = useState("");
  const [brand, setBrand] = useState("");
  const [page, setPage] = useState<RunPage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const query = new URLSearchParams();
  if (workspace) query.set("workspace", workspace);
  if (keyword.trim()) query.set("q", keyword.trim());
  if (engine) query.set("engine", engine);
  if (status) query.set("status", status);
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
      <div className="form-grid prompt-filters">
        <label className="app-field"><span>Search run history</span>
          <input type="search" value={keyword} onChange={e => setKeyword(e.target.value)} maxLength={200}
            placeholder="Search prompt text or answers" />
        </label>
        <label className="app-field"><span>Engine</span>
          <select value={engine} onChange={e => setEngine(e.target.value)}>
            <option value="">All engines</option>
            {Object.entries(engines).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="app-field"><span>Prompt</span>
          <select value={runPrompt ?? ""} onChange={e => onPromptChange(e.target.value)}>
            <option value="">All prompts</option>
            {[...promptOptions].map(([id, text]) => <option key={id} value={id}>{text.length > 95 ? text.slice(0, 94) + "…" : text}</option>)}
          </select>
        </label>
        <label className="app-field"><span>Brand mentioned or cited</span>
          <select value={brand} onChange={e => setBrand(e.target.value)}>
            <option value="">Any brand</option>
            {brands.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="app-field"><span>Run status</span>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      </div>
      {!current && <p role="status">Loading run history…</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {current && !current.error && !current.runs.length && (
        <p className="data-note">{keyword || engine || status || brand || runPrompt
          ? "No runs match these filters. Try a different keyword or clear a filter."
          : "No runs in this workspace yet. Go to Prompts to start a collection."}</p>
      )}
      {current?.runs.map(run => (
        <Link key={run.id} className="run-row" to="/app" search={{ org, workspace: workspace || "all", tab: "runs", run: run.id, runPrompt }}>
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
