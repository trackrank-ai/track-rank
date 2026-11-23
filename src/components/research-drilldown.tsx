import { analyticsQuery, analyticsScope, DAY_MS, utcDay } from "@/lib/analytics-filters";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AppSearch, ResearchType } from "@/lib/app-location";
import { useReport } from "./overview";
import { formatLastSeen, formatShare, SourcePagination, SourceTable, type ResearchSummary } from "./research-results";

type Item = Record<string, any>;
type ResearchPage = { total_matches: number; runs: Item[]; next_before: number | null; next_before_id: string | null };
const researchNames = { domain: "Cited domain", page: "Cited page", query: "Grounding query" };

export function ResearchDrilldown({ search, type, value, engines, workspaceNames, request }: {
  search: AppSearch;
  type: ResearchType;
  value: string;
  engines: Record<string, string>;
  workspaceNames: Record<string, string>;
  request: (path: string) => Promise<Item>;
}) {
  const answersHeading = useRef<HTMLHeadingElement>(null);
  const [page, setPage] = useState<ResearchPage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const view = search.sourceView === "pages" && type !== "domain" ? "questions"
    : search.sourceView ?? (type === "domain" ? "pages" : "questions");
  const query = analyticsQuery(analyticsScope(search), search.workspace ?? "all");
  query.set("research_type", type);
  query.set("research_value", value);
  const reportQuery = new URLSearchParams(query);
  reportQuery.set("view", view === "pages" ? "pages" : "questions");
  if (view !== "answers" && search.sourceDetailPage) reportQuery.set("page", search.sourceDetailPage);
  const report = useReport<ResearchSummary>("/research?" + reportQuery, request, null);
  if (search.sourceQuestion) {
    query.set("report_evidence_run", search.sourceQuestion);
    query.set("report_question_all_engines", "true");
  }
  const path = "/runs?" + query;
  useEffect(() => {
    if (view !== "answers") return;
    let canceled = false;
    setPage(null);
    setError("");
    request(path).then(data => {
      if (!canceled) setPage(data as ResearchPage);
    }).catch(error => {
      if (!canceled) setError(error.message);
    });
    return () => { canceled = true; };
  }, [path, request, view]);

  useEffect(() => {
    if (view === "answers" && search.sourceQuestion && page) answersHeading.current?.focus();
  }, [view, search.sourceQuestion, !!page]);

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

  const detail = report?.data?.detail;
  const runs = page?.runs ?? [];
  const selectedQuestion = runs[0]?.prompt_text;
  const listSearch: AppSearch = { ...search, researchType: undefined, researchValue: undefined, sourceView: undefined,
    sourceDetailPage: undefined, sourceQuestion: undefined, sourceDomain: undefined, sourceDomainPage: undefined, sourceBackRun: undefined };
  const backSearch: AppSearch = search.sourceDomain
    ? { ...listSearch, researchType: "domain", researchValue: search.sourceDomain, sourceDetailPage: search.sourceDomainPage }
    : listSearch;
  const days = detail?.daily ?? [];
  const calendar: { day: string; through: string; answers: number }[] = [];
  if (days.length) {
    const first = Date.parse(search.from ?? days[0].day);
    const last = Date.parse(search.to ?? days[days.length - 1].day);
    const bucketSpan = Math.ceil((last - first + DAY_MS) / DAY_MS / 180) * DAY_MS;
    for (let date = first; date <= last; date += bucketSpan) {
      calendar.push({ day: utcDay(date), through: utcDay(Math.min(last, date + bucketSpan - DAY_MS)), answers: 0 });
    }
    for (const day of days) calendar[Math.floor((Date.parse(day.day) - first) / bucketSpan)].answers += day.answers;
  }
  const peak = Math.max(1, ...calendar.map(day => day.answers));

  return (
    <Card><CardContent>
      <Link className="small-link" to="/app" search={backSearch}>{search.sourceDomain ? "Back to cited domain" : "Back to sources"}</Link>
      {search.sourceBackRun && <Link className="small-link ml-4" to="/app"
        search={{ ...listSearch, tab: "runs", run: search.sourceBackRun, evidence: "citations" }}>Back to answer</Link>}
      <header className="research-detail-value my-4">
        <p className="data-note">{researchNames[type]}</p>
        <h2>{value}</h2>
        {type === "page" && /^https?:\/\//i.test(value) && <a className="small-link" href={value} target="_blank" rel="noreferrer">Open original</a>}
      </header>
      {report?.error && <p role="alert">{report.error}</p>}
      {!detail && !report?.error && <p role="status" className="data-note">Loading source metrics…</p>}
      {detail && <>
        <dl className="source-metrics">
          <div><dt>Matching answers</dt><dd>{detail.count.toLocaleString()}</dd></div>
          <div><dt>Questions</dt><dd>{detail.questions.toLocaleString()}</dd></div>
          <div><dt>Share of eligible answers</dt><dd>{formatShare(detail.share)} <small>of {report.data!.answers.toLocaleString()}</small></dd></div>
          <div><dt>Last seen (UTC)</dt><dd>{detail.last_seen === null ? "—" : formatLastSeen(detail.last_seen)}</dd></div>
        </dl>
        {!!days.length && <section className="my-4" aria-label="Matching answers by date">
          <div className="source-trend mt-3" aria-hidden="true">
            {calendar.map(({ day, through, answers }) => <span key={day}
              title={`${day === through ? day : `${day} to ${through}`} · ${answers} ${answers === 1 ? "answer" : "answers"}`}
              style={{ height: (100 * answers / peak) + "%" }} />)}
          </div>
          <details className="mt-2">
            <summary>Daily matching answers (UTC)</summary>
            <div className="source-daily-counts mt-3">
              <table className="source-table"><thead><tr><th scope="col">Date (UTC)</th><th scope="col">Answers</th></tr></thead>
                <tbody>{days.map(({ day, answers }) => <tr key={day}><th scope="row">{day}</th><td>{answers.toLocaleString()}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </section>}
        <nav className="app-subnav mt-4" aria-label="Source evidence groups">
          {(["pages", "questions", "answers"] as const).filter(item => type === "domain" || item !== "pages").map(item => <Button key={item} size="sm" variant={view === item ? "secondary" : "ghost"} asChild>
            <Link to="/app" search={{ ...search, sourceView: item, sourceDetailPage: undefined, sourceQuestion: undefined }} aria-current={view === item ? "page" : undefined}>
              {item === "pages" ? "Cited pages" : item === "questions" ? `Questions (${detail.questions.toLocaleString()})` : `Answers (${detail.count.toLocaleString()})`}
            </Link>
          </Button>)}
        </nav>
        {view !== "answers" && (report.data!.items.length ? <SourceTable rows={report.data!.items} title={view === "pages" ? "Page" : "Question"}
          questionRows={view === "questions"}
          questionContext={view === "questions" ? item => workspaceNames[item.workspace_id ?? ""] ?? "Unavailable workspace" : undefined}
          link={item => view === "pages"
            ? { ...search, researchType: "page", researchValue: item.value, sourceDomain: type === "domain" ? value : search.sourceDomain,
              sourceView: undefined, sourceDetailPage: undefined, sourceQuestion: undefined,
              sourceDomainPage: type === "domain" ? search.sourceDetailPage : search.sourceDomainPage }
            : { ...search, sourceView: "answers", sourceQuestion: item.evidence_run_id ?? undefined }}
        /> : <p className="data-note mt-3">No {view === "pages" ? "cited pages" : "questions"} in this scope.</p>)}
        {view !== "answers" && <SourcePagination data={report.data!} search={search} field="sourceDetailPage" />}
      </>}
      {view === "answers" && <section className="mt-4" aria-labelledby="source-answers">
        <div className="panel-title"><h3 id="source-answers" ref={answersHeading} tabIndex={-1}>{search.sourceQuestion && selectedQuestion ? `Matching answers for “${selectedQuestion}”` : "Matching answers"}</h3>
          {search.sourceQuestion && <div className="app-inline-form">
            <Link className="small-link" to="/app" search={{ ...search, sourceView: "questions", sourceQuestion: undefined }}>Back to questions</Link>
            <Link className="small-link" to="/app" search={{ ...search, sourceQuestion: undefined }}>Show all answers</Link>
          </div>}
        </div>
        {error && <p role="alert">{error}</p>}
        {!page && !error && <p role="status" className="data-note">Loading matching answers…</p>}
        {page && <p className="data-note" role="status">{runs.length.toLocaleString()} of {page.total_matches.toLocaleString()} matching answers shown</p>}
        {runs.length > 0 && <>
          <a className="small-link" href={"/api/v1/export?" + new URLSearchParams({ ...Object.fromEntries(query), org: search.org ?? "" })}>
            Export {page!.total_matches > 1000 ? "latest 1,000 matches" : "matching answers"} as CSV
          </a>
          {runs.map(run => (
            <div className="simple-row research-answer-row" key={run.id}>
              <Link to="/app" search={{ ...search, tab: "runs", run: run.id }}>
                <strong>{run.prompt_text}</strong>
                <small>
                  {engines[run.config?.engine] ?? "Unknown engine"} · {workspaceNames[run.workspace_id] ?? "Unavailable workspace"} · {new Date(run.created_at).toLocaleString()}
                </small>
              </Link>
              <span>{(run.mentions || []).filter((brand: Item) => brand.mentioned).map((brand: Item) => brand.name).join(", ")}</span>
            </div>
          ))}
          {page?.next_before_id && <Button size="sm" variant="outline" disabled={busy} onClick={more}>
            {busy ? "Loading…" : "Load older matching answers"}
          </Button>}
        </>}
      </section>}
    </CardContent></Card>
  );
}
