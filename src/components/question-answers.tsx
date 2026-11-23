import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppSearch } from "@/lib/app-location";
import { DAY_MS, defaultPeriod } from "@/lib/analytics-filters";

type Answer = {
  id: string;
  created_at: number;
  prompt_text?: string;
  answer_excerpt?: string;
  config: {
    engine?: string;
    location_name?: string;
    brands?: { id: string; name: string }[];
  };
  mentions?: { brand_id: string; mentioned: boolean; cited: boolean }[];
  citations?: unknown[];
};
type Day = { day: string; answers: number };
type Page = { question_daily?: Day[]; runs: Answer[]; next_before: number | null; next_before_id: string | null };

function AnswerTrend({ days, period }: { days: Day[]; period: ReturnType<typeof defaultPeriod> }) {
  if (!days.length) return null;
  const start = Date.parse(period.from);
  const duration = (Date.parse(period.to) - start) / DAY_MS + 1;
  const width = 600 / duration;
  const high = days.reduce((max, day) => Math.max(max, day.answers), 1);
  return <figure className="question-trend">
    <figcaption>Matching answers by day <span className="data-note">UTC</span></figcaption>
    <svg viewBox="0 0 600 55" preserveAspectRatio="none" role="img" aria-label="Daily matching answer counts. Values are available in the daily counts table.">
      {days.map(({ day, answers }) => {
        const height = 50 * answers / high;
        return <rect key={day} x={width * (Date.parse(day) - start) / DAY_MS}
          y={55 - height} width={width * 0.85} height={height}><title>{day} · {answers} answers</title></rect>;
      })}
    </svg>
    <div className="question-trend-dates"><span>{period.from}</span><span>{period.to}</span></div>
    <details><summary>Daily counts</summary>
      <table><thead><tr><th>Date (UTC)</th><th>Matching answers</th></tr></thead>
        <tbody>{days.map(entry => <tr key={entry.day}><td>{entry.day}</td><td>{entry.answers}</td></tr>)}</tbody>
      </table>
    </details>
  </figure>;
}

export function QuestionAnswers({ path, request, org, context, engines, engine, brand, period, revision, hasCollections, emptyAction, showQuestion, outcome }: {
  path: string;
  request: (path: string) => Promise<Record<string, any>>;
  org: string;
  context: AppSearch;
  engines: Record<string, string>;
  engine?: string;
  brand?: string;
  period: ReturnType<typeof defaultPeriod>;
  revision: unknown;
  hasCollections: boolean;
  emptyAction?: React.ReactNode;
  showQuestion?: boolean;
  outcome?: "mention" | "citation";
}) {
  const [page, setPage] = useState<Page>();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setPage(undefined);
    setError("");
    request(path).then(data => {
      if (current) setPage(data as Page);
    }).catch((error: Error) => {
      if (current) setError(error.message);
    });
    return () => { current = false; };
  }, [path, request, revision, attempt]);

  async function loadOlder() {
    if (page?.next_before == null || !page.next_before_id) return;
    setLoading(true);
    setError("");
    const cursor = new URLSearchParams({ before: String(page.next_before), before_id: page.next_before_id });
    try {
      const older = await request(path + "&" + cursor) as Page;
      setPage(current => current === page ? { ...older, question_daily: page.question_daily, runs: [...page.runs, ...older.runs] } : current);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to load more answers");
    } finally {
      setLoading(false);
    }
  }

  return <div className="form-stack">
    <div className="panel-title">
      <div>
        <h2>{outcome === "mention" ? "Answers with brand mentions" : outcome === "citation" ? "Answers with brand citations" : "Recorded answers"}</h2>
        <p>{period.from} to {period.to} (UTC){engine && ` · ${engine}`}{brand && ` · Tracked brand: ${brand}`}</p>
      </div>
      {!!page?.runs.length && <a className="small-link" href={"/api/v1/export?" + path.split("?")[1] + "&org=" + encodeURIComponent(org)}>
        Export CSV
      </a>}
    </div>
    {error && <div className="question-row-actions">
      <p role="alert">{error}</p>
      {!page && <Button type="button" variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>
        Retry answers
      </Button>}
    </div>}
    {!page && !error && <p role="status">Loading answers…</p>}
    {page && !page.runs.length && <>
      <p>{hasCollections ? "No eligible answers match this period and filters."
        : emptyAction ? "No checks in searchable history. Review a collection for the selected engine variants."
        : "No checks in searchable history. Answers appear after an eligible collection completes."}</p>
      {emptyAction}
    </>}
    {page?.question_daily && <AnswerTrend days={page.question_daily} period={period} />}
    {page?.runs.map(answer => {
      const citations = answer.citations?.length ?? 0;
      return <article className="question-answer" key={answer.id}>
        <div>
          {showQuestion && <strong>{answer.prompt_text}</strong>}
          <div className={showQuestion ? "data-note" : "font-semibold"}>{engines[answer.config?.engine ?? ""] ?? "Recorded engine"}</div>
          <p className="data-note">{new Date(answer.created_at).toLocaleString()}
            {answer.config?.location_name && ` · ${answer.config.location_name}`}</p>
          {answer.answer_excerpt && <p className="answer-excerpt">{answer.answer_excerpt}</p>}
          <div className="answer-brand-mentions">{answer.config?.brands?.map(snapshot => {
            const observation = answer.mentions?.find(item => item.brand_id === snapshot.id);
            const outcome = [observation?.mentioned && "mentioned", observation?.cited && "cited"].filter(Boolean).join(" and ");
            return <p className="data-note" key={snapshot.id}>{snapshot.name} · {outcome || "No mention or citation"}</p>;
          })}</div>
        </div>
        <div className="question-row-actions">
          <Link className="small-link" to="/app" search={{ ...context, org, tab: "runs", run: answer.id }}>
            Open answer <ArrowUpRight size={14} aria-hidden />
          </Link>
          <Link className="small-link" to="/app" search={{ ...context, org, tab: "runs", run: answer.id, evidence: "citations" }}>
            {citations} {citations === 1 ? "citation" : "citations"}
          </Link>
        </div>
      </article>;
    })}
    {!!page?.next_before_id && <div><Button size="sm" variant="outline" disabled={loading} onClick={loadOlder}>
      {loading ? "Loading…" : "Load older answers"}
    </Button></div>}
  </div>;
}
