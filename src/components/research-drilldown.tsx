import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ResearchType } from "@/lib/app-location";

type Item = Record<string, any>;
type ResearchPage = { runs: Item[]; next_before: number | null; next_before_id: string | null };
const researchNames = { domain: "Cited domain", page: "Cited page", query: "Grounding query" };

export function ResearchDrilldown({ org, workspace, type, value, request }: {
  org: string;
  workspace: string;
  type: ResearchType;
  value: string;
  request: (path: string) => Promise<Item>;
}) {
  const [page, setPage] = useState<ResearchPage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const query = new URLSearchParams({ research_type: type, research_value: value });
  if (workspace !== "all") query.set("workspace", workspace);
  const path = "/runs?" + query;
  useEffect(() => {
    let canceled = false;
    request(path).then(data => {
      if (!canceled) setPage(data as ResearchPage);
    }).catch(error => {
      if (!canceled) setError(error.message);
    });
    return () => { canceled = true; };
  }, [path, request]);

  async function more() {
    if (!page?.next_before_id || page.next_before === null || busy) return;
    setBusy(true);
    setError("");
    try {
      const cursor = new URLSearchParams({ before: String(page.next_before), before_id: page.next_before_id });
      const result = await request(path + "&" + cursor) as ResearchPage;
      setPage({ ...result, runs: [...page.runs, ...result.runs] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load more answers");
    } finally {
      setBusy(false);
    }
  }

  const pages = new Map<string, Item>();
  const brands = new Map<string, { name: string; mentions: number; citations: number }>();
  const detected = new Set<string>();
  const runs = page?.runs ?? [];
  for (const run of runs) {
    for (const source of run.citations || []) {
      if (type !== "domain" || source.domain === value) pages.set(source.url, source);
    }
    for (const brand of run.mentions || []) {
      if (!brand.mentioned && !brand.cited) continue;
      const counts = brands.get(brand.brand_id) ?? { name: brand.name, mentions: 0, citations: 0 };
      counts.mentions += Number(!!brand.mentioned);
      counts.citations += Number(!!brand.cited);
      brands.set(brand.brand_id, counts);
    }
    for (const brand of run.discovered_brands || []) if (brand.name) detected.add(brand.name);
  }

  return (
    <Card><CardContent>
      <div className="panel-title">
        <div className="research-detail-value">
          <h2>{researchNames[type]}</h2>
          <p>{value}</p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app" search={{ org, workspace, tab: "research" }}>Back to research</Link>
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!page && !error && <p role="status">Loading matching answers…</p>}
      {page && !runs.length && <p>No matching answers in this view.</p>}
      {runs.length > 0 && <>
        <h3>Matching answers</h3>
        <p className="data-note">{runs.length} answers loaded. Page and brand counts cover these answers.</p>
        {runs.map(run => (
          <div className="simple-row" key={run.id}>
            <Link to="/app" search={{ org, workspace: run.workspace_id, tab: "runs", run: run.id }}>
              <strong>{run.prompt_text}</strong>
              <small>{new Date(run.created_at).toLocaleString()}</small>
            </Link>
            <span>{(run.mentions || []).filter((brand: Item) => brand.mentioned).map((brand: Item) => brand.name).join(", ")}</span>
          </div>
        ))}
        {page?.next_before_id && <Button size="sm" variant="outline" disabled={busy} onClick={more}>
          {busy ? "Loading…" : "Load older matching answers"}
        </Button>}
        <h3>Cited pages</h3>
        {pages.size ? [...pages.values()].map(source => (
          <div className="citation-row" key={source.url}>
            <Link to="/app" search={{ org, workspace, tab: "research", researchType: "page", researchValue: source.url }}>
              <strong>{source.title || source.url}</strong><span>{source.url}</span>
            </Link>
          </div>
        )) : <p className="data-note">These answers have no cited pages.</p>}
        <h3>Tracked brands in these answers</h3>
        {brands.size ? [...brands].map(([id, brand]) => (
          <div className="simple-row" key={id}>
            <strong>{brand.name}</strong>
            <span>{brand.mentions} mentions · {brand.citations} cited answers</span>
          </div>
        )) : <p className="data-note">These answers have no tracked-brand mentions or citations.</p>}
        {detected.size > 0 && <>
          <h3>Provider-detected brands</h3>
          <p className="data-note">{[...detected].join(", ")}</p>
        </>}
      </>}
    </CardContent></Card>
  );
}
