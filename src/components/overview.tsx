import { Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { analyticsQuery, analyticsScope, utcDay, type AnalyticsScope, type AnswerMetric } from "@/lib/analytics-filters";
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
  workspace_prompts: number;
  workspace_has_runs: boolean;
  workspace_first_run: number | null;
  outcomes: Record<string, number>;
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
      {brands.length > 0 && <label className="app-field"><span>Tracked brand</span>
        <select name="trackedBrand" defaultValue={scope.trackedBrand ?? ""}>
          <option value="">{brands.length ? "Default brand" : "No tracked brand"}</option>
          {scope.trackedBrand && !brands.some(brand => brand.id === scope.trackedBrand) && <option value={scope.trackedBrand}>Selected historical brand</option>}
          {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
      </label>}
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

export function Overview({
  org, workspace, workspaceName, scope, brands, sets, engines, hasTrackedBrand, brandWorkspace, credentialsConnected, canWrite,
  canManageCredentials, request, revision, filters,
}: {
  org: string;
  workspace: string;
  workspaceName: string;
  scope: AnalyticsScope;
  brands: Brand[];
  sets: PromptSet[];
  engines: Record<string, string>;
  hasTrackedBrand: boolean;
  brandWorkspace: string;
  credentialsConnected: boolean;
  canWrite: boolean;
  canManageCredentials: boolean;
  request: RequestData;
  revision: unknown;
  filters: ReactNode;
}) {
  const result = useReport<OverviewData>("/analytics?" + analyticsQuery(scope, workspace), request, revision);
  if (result?.error) return <><p role="alert">{result.error}</p>{filters}</>;
  if (!result?.data) return <p role="status">Calculating visibility…</p>;
  const data = result.data;
  if (!data.workspace_has_runs) {
    const next = !hasTrackedBrand ? "brands" : !data.workspace_prompts ? "prompts"
      : !credentialsConnected ? "settings" : "collect";
    const steps = [
      { id: "brands", complete: hasTrackedBrand, tab: "brands", label: "Track a brand", action: "Add or assign brand",
        description: "Assign a brand to a workspace to measure mentions and citations.", permitted: canWrite },
      { id: "prompts", complete: !!data.workspace_prompts, tab: "prompts", label: "Save questions", action: "Open Prompts",
        description: "Choose the questions and engines you want to track.", permitted: canWrite },
      { id: "settings", complete: credentialsConnected, tab: "settings", label: "Connect DataForSEO", action: "Open Settings",
        description: "Connect your organization’s provider account to collect answers.", permitted: canManageCredentials },
      { id: "collect", complete: false, tab: "prompts", label: "Start a collection", action: "Choose variants",
        description: "Review and run saved combinations from Prompts.", permitted: canWrite },
    ] as const;
    return <Card><CardContent className="form-stack overview-setup">
      <div><h2>{next === "collect" ? "Ready to collect answers" : "Get ready to collect answers"}</h2>
        <p className="overview-scope">{workspaceName} · No runs in searchable history</p>
      </div>
      <ol>
        {steps.map(step => <li key={step.id}>
          <div><strong>{step.label}</strong><p className="overview-scope">{step.description}</p></div>
          {step.complete ? <span className="overview-scope">Complete</span>
            : step.permitted ? <Button size="sm" variant={step.id === next ? "default" : "outline"} asChild>
              <Link to="/app" search={{ org, workspace: step.id === "brands" ? brandWorkspace : workspace, tab: step.tab }}>{step.action}</Link>
            </Button> : <span className="overview-scope">{step.id === "settings" ? "Organization admin required" : "Editor access required"}</span>}
        </li>)}
      </ol>
    </CardContent></Card>;
  }
  const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" })
    .formatRange(new Date(data.from), new Date(data.to));
  const setName = sets.find(set => set.id === scope.set)?.name;
  const brandName = brands.find(brand => brand.id === scope.trackedBrand)?.name;
  const scopeLabel = [workspaceName, `${dateLabel} (UTC)`, scope.set && (setName || "Selected prompt set"),
    scope.engine && engines[scope.engine], scope.location, scope.tags && `Tags ${scope.tags}`,
    scope.trackedBrand && (brandName || "Selected historical brand")].filter(Boolean).join(" · ");
  if (!data.total_runs) return <>
    <Card><CardContent className="form-stack overview-findings">
      <h2>No collections match these filters</h2>
      <p className="overview-scope">{scopeLabel}</p>
      <p>Clear filters to see the available collection history, or choose a different date range.</p>
      <Link to="/app" search={{ org, workspace, tab: "overview", from: data.workspace_first_run === null ? undefined : utcDay(data.workspace_first_run) }}>Show available history</Link>
    </CardContent></Card>
    {filters}
  </>;
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
    <Card><CardContent className="overview-findings">
      <h2>Visibility findings</h2>
      <p className="overview-scope">{scopeLabel}</p>
      {data.eligible_answers > 0 && stat && brandName && stat.samples > 0
        ? <p><strong>{brandName}</strong> appeared in <Link to="/app" search={metricLink("mention")}>{stat.mentions.toLocaleString()} of {stat.samples.toLocaleString()} answers</Link> collected with that brand tracked.
          Its website was cited in <Link to="/app" search={metricLink("citation")}>{stat.citations.toLocaleString()} of those answers</Link>.</p>
        : <p>{data.eligible_answers > 0
          ? <><Link to="/app" search={metricLink("eligible")}>{data.eligible_answers.toLocaleString()} AI {data.eligible_answers === 1 ? "answer" : "answers"}</Link> from {data.total_runs.toLocaleString()} {data.total_runs === 1 ? "run" : "runs"}.</>
          : <>No AI answers yet from <Link to="/app" search={metricLink()}>{data.total_runs.toLocaleString()} {data.total_runs === 1 ? "run" : "runs"}</Link> in this scope.</>}</p>}
    </CardContent></Card>
    <div className="app-inline-form" aria-label="Collection outcomes">
      {([["pending", "Pending"], ["failed", "Failed"], ["uncertain", "Uncertain"], ["organic", "Organic only"], ["eligible", "Eligible answers"]] as const)
        .map(([outcome, label]) => <Link key={outcome} to="/app" search={{ ...metricLink(), outcome }}>
          {label} ({data.outcomes[outcome] ?? 0})
        </Link>)}
    </div>
    <div className="app-metrics">
      {metrics.map(metric => <Card className="app-stat" key={metric.label}><CardContent>
        <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small>
        <Link className="small-link" to="/app" search={metricLink(metric.metric)}>View matching runs</Link>
        {(metric.metric === "mention" || metric.metric === "citation") &&
          <Link className="small-link" to="/app" search={metricLink("brand")}>View eligible answers</Link>}
      </CardContent></Card>)}
    </div>
    {filters}
    {scope.trackedBrand && <Card><CardContent>
      <div className="panel-title"><div><h2>Visibility over time</h2><p>Daily mention rate and citation counts in UTC.</p></div></div>
      {!data.daily.length ? <p className="data-note">No eligible answers</p>
        : <DailyTrend days={data.daily} link={day => metricLink("brand", { from: day, to: day })} />}
    </CardContent></Card>}
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
