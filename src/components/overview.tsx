import { Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { analyticsQuery, analyticsScope, type AnalyticsScope, type AnswerMetric } from "@/lib/analytics-filters";
import type { AppSearch } from "@/lib/app-location";
import { MAX_PROMPT_TAGS, splitPromptTags, validPromptTag } from "@/lib/prompt-tags";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PromptSet } from "./prompt-sets";

type Item = Record<string, any>;
type RequestData = (path: string) => Promise<Item>;
type Brand = { id: string; name: string };
type Counts = { samples: number; mentions: number; citations: number };
type Day = Counts & { day: string };
type OverviewData = {
  from: string;
  to: string;
  total_runs: number;
  eligible_answers: number;
  selected_prompts: number;
  covered_prompts: number;
  brands: (Counts & { id: string })[];
  daily: Day[];
  domains: { domain: string; answers: number }[];
};

export function useReport<T>(path: string, request: RequestData, revision: unknown) {
  const [result, setResult] = useState<{ path: string; request: RequestData; data?: T; error?: string }>();
  useEffect(() => {
    if (!path) return;
    let active = true;
    request(path).then(data => {
      if (active) setResult({ path, request, data: data as T });
    }).catch(error => {
      if (active) setResult({ path, request, error: error.message });
    });
    return () => { active = false; };
  }, [path, request, revision]);
  return result?.path === path && result.request === request ? result : undefined;
}

export function OverviewFilters({ scope, org, workspace, workspaceNames, sets, brands, engines, request, revision, onChange }: {
  scope: AnalyticsScope;
  org: string;
  workspace: string;
  workspaceNames: Record<string, string>;
  sets: PromptSet[];
  brands: Brand[];
  engines: Record<string, string>;
  request: RequestData;
  revision: unknown;
  onChange: (scope: AnalyticsScope) => void;
}) {
  const [error, setError] = useState("");
  const locationQuery = analyticsQuery({ ...scope, location: undefined, trackedBrand: undefined }, workspace);
  const locations = useReport<{ locations: string[] }>("/analytics/locations?" + locationQuery, request, revision);
  const activeSet = sets.find(set => set.id === scope.set);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const tags = splitPromptTags(String(data.tags ?? ""));
      if (tags.length > MAX_PROMPT_TAGS || tags.some(tag => !validPromptTag(tag)))
        throw new Error("Enter up to 20 tags of 1–50 characters each.");
      onChange(analyticsScope({ ...data, tags: tags.join(",") }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid tags");
    }
  }
  return <Card><CardContent>
    <form className="form-grid prompt-filters" onSubmit={apply}>
      <label className="app-field"><span>Prompt set</span>
        <select name="set" defaultValue={scope.set ?? ""}>
          <option value="">All prompts</option>
          {scope.set && !activeSet && <option value={scope.set}>Selected set</option>}
          {sets.map(set => <option key={set.id} value={set.id}>{set.name}{workspace === "all" ? ` · ${workspaceNames[set.workspace_id]}` : ""}</option>)}
        </select>
      </label>
      <label className="app-field"><span>Tags · match all</span>
        <input name="tags" defaultValue={scope.tags} maxLength={1020} placeholder="consideration, chicago-market" />
        <small>Up to {MAX_PROMPT_TAGS} comma-separated tags.</small>
      </label>
      <label className="app-field"><span>Engine</span>
        <select name="engine" defaultValue={scope.engine ?? ""}>
          <option value="">All engines</option>
          {Object.entries(engines).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label className="app-field"><span>Collection location</span>
        <input name="location" defaultValue={scope.location} maxLength={200} list="recorded-locations" placeholder="All locations" />
        <datalist id="recorded-locations">{locations?.data?.locations.map(name => <option value={name} key={name} />)}</datalist>
      </label>
      <label className="app-field"><span>Tracked brand</span>
        <select name="trackedBrand" defaultValue={scope.trackedBrand ?? ""}>
          <option value="">{brands.length ? "Default brand" : "No tracked brand"}</option>
          {scope.trackedBrand && !brands.some(brand => brand.id === scope.trackedBrand) && <option value={scope.trackedBrand}>Selected historical brand</option>}
          {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
      </label>
      <label className="app-field"><span>From (UTC)</span>
        <input name="from" type="date" required defaultValue={scope.from} />
      </label>
      <label className="app-field"><span>Through (UTC)</span>
        <input name="to" type="date" required defaultValue={scope.to} />
      </label>
      <div className="app-inline-form">
        <Button type="submit">Apply filters</Button>
        <Button type="button" variant="outline" onClick={event => { event.currentTarget.form?.reset(); setError(""); onChange({}); }}>Clear filters</Button>
      </div>
    </form>
    {activeSet && <Link className="small-link" to="/app" search={{ org, workspace: activeSet.workspace_id, tab: "prompts", set: activeSet.id }}>View prompts in {activeSet.name}</Link>}
    {error && <p role="alert">{error}</p>}
  </CardContent></Card>;
}

export function Overview({ org, workspace, scope, brands, request, revision }: {
  org: string;
  workspace: string;
  scope: AnalyticsScope;
  brands: Brand[];
  request: RequestData;
  revision: unknown;
}) {
  const result = useReport<OverviewData>("/analytics?" + analyticsQuery(scope, workspace), request, revision);
  if (result?.error) return <p role="alert">{result.error}</p>;
  if (!result?.data) return <p role="status">Calculating visibility…</p>;
  const data = result.data;
  if (scope.set && !data.selected_prompts) return <p className="data-note">
    {scope.tags ? "No prompts in this set match the selected tags." : "This prompt set is empty. Add prompts to see its performance."}
  </p>;
  const metricLink = (metric?: AnswerMetric, overrides?: AnalyticsScope) => ({
    ...scope, ...overrides, org, workspace, tab: "runs" as const, metric,
  });
  const stat = data.brands.find(brand => brand.id === scope.trackedBrand);
  const rate = (count: number, total: number) => total ? Math.round(count / total * 100) + "%" : "No eligible answers";
  const metrics = [
    ...scope.trackedBrand ? ([
      ["Brand mention rate", "mentions", "mention"],
      ["Website citation rate", "citations", "citation"],
    ] as const).map(([label, count, metric]) => ({
      label, metric, value: rate(stat?.[count] ?? 0, stat?.samples ?? 0),
      note: `${stat?.[count] ?? 0} / ${stat?.samples ?? 0} eligible answers`,
    })) : [],
    { label: "Prompt coverage", metric: "coverage" as const, value: `${data.covered_prompts} of ${data.selected_prompts}`, note: "Selected prompts with an eligible AI answer" },
    { label: "Collected answers", metric: "eligible" as const, value: data.eligible_answers || "No eligible answers", note: `${data.eligible_answers} / ${data.total_runs} runs` },
  ];
  return <>
    <div className="app-metrics">
      {metrics.map(metric => <Card className="app-stat" key={metric.label}><CardContent>
        <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small>
        <Link className="small-link" to="/app" search={metricLink(metric.metric)}>View matching runs</Link>
        {(metric.metric === "mention" || metric.metric === "citation") &&
          <Link className="small-link" to="/app" search={metricLink("brand")}>View eligible answers</Link>}
      </CardContent></Card>)}
    </div>
    <Card><CardContent>
      <div className="panel-title"><div><h2>Visibility over time</h2><p>Daily mention rate and citation counts in UTC.</p></div></div>
      {!scope.trackedBrand ? <p className="data-note">Choose a tracked brand to see its trend.</p>
        : !data.daily.length ? <p className="data-note">No eligible answers</p>
        : <DailyTrend days={data.daily} link={day => metricLink("brand", { from: day, to: day })} />}
    </CardContent></Card>
    {brands.length > 0 && <Card><CardContent>
      <div className="panel-title"><h2>Brand comparison</h2></div>
      {brands.map(brand => {
        const counts = data.brands.find(row => row.id === brand.id);
        return <div className="simple-row" key={brand.id}>
          <strong>{brand.name}</strong>
          <Link to="/app" search={metricLink("mention", { trackedBrand: brand.id })}>
            {rate(counts?.mentions ?? 0, counts?.samples ?? 0)} · {counts?.mentions ?? 0} / {counts?.samples ?? 0} mentions
          </Link>
        </div>;
      })}
    </CardContent></Card>}
    <Card><CardContent>
      <div className="panel-title"><h2>Most-cited domains</h2>
        <Link className="small-link" to="/app" search={{ ...scope, org, workspace, tab: "research" }}>Explore sources and grounding queries</Link>
      </div>
      {data.domains.length ? data.domains.map(({ domain, answers }) => <div className="simple-row" key={domain}>
        <Link to="/app" search={{ ...scope, org, workspace, tab: "research", researchType: "domain", researchValue: domain }}>{domain}</Link>
        <span>{answers} / {data.eligible_answers} answers</span>
      </div>) : <p className="data-note">No cited domains in this view.</p>}
    </CardContent></Card>
  </>;
}

function DailyTrend({ days, link }: { days: Day[]; link: (day: string) => AppSearch }) {
  const first = Date.parse(days[0].day);
  const duration = Date.parse(days[days.length - 1].day) - first;
  const points = days.map(day => ({
    ...day, x: duration ? 10 + 780 * (Date.parse(day.day) - first) / duration : 400,
    y: 170 - 160 * day.mentions / day.samples,
  }));
  return <div className="history-chart">
    <div className="history-axis"><span>100%</span><span>50%</span><span>0%</span></div>
    <svg viewBox="0 0 800 180" role="img" aria-label="Daily brand mention rate">
      <path d="M0 10H800M0 90H800M0 170H800" stroke="var(--border)" strokeDasharray="4 4" />
      <polyline points={points.map(p => `${p.x},${p.y}`).join(" ")} stroke="var(--primary)" strokeWidth="3" fill="none" />
      {points.map(point => <circle key={point.day} cx={point.x} cy={point.y} r="5" fill="var(--primary)">
        <title>{point.day} · {point.mentions} / {point.samples} mentions</title>
      </circle>)}
    </svg>
    <div className="history-dates"><span>{days[0].day}</span><span>{days[days.length - 1].day}</span></div>
    <details><summary>View daily sample counts and runs</summary>
      <div className="chart-data">{days.map(day =>
        <Link key={day.day} to="/app" search={link(day.day)}>
          {day.day} · {day.mentions} / {day.samples} mentions · {day.citations} citations
        </Link>)}</div>
    </details>
  </div>;
}
