import { Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { analyticsQuery, analyticsScope, utcDay, type AnalyticsScope, type AnswerMetric, type TrendMetric } from "@/lib/analytics-filters";
import type { AppSearch } from "@/lib/app-location";
import { MAX_PROMPT_TAGS, splitPromptTags, validPromptTag } from "@/lib/prompt-tags";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PromptSet } from "./prompt-sets";

type Item = Record<string, any>;
type RequestData = (path: string) => Promise<Item>;
type Brand = { id: string; name: string };
type Counts = { samples: number; mentions: number; citations: number };
type Day = Counts & { day: string; compare_mentions?: number; compare_citations?: number };
type QuestionBreakdownRow = {
  evidence_run_id: string;
  workspace_id: string;
  question: string;
  engine: AnalyticsScope["engine"] | null;
  eligible_answers: number;
  mentions: number;
  citations: number;
  compare_mentions: number;
  compare_citations: number;
};
type EvidenceLink = (metric?: AnswerMetric, day?: string, row?: { evidence_run_id: string; engine: AnalyticsScope["engine"] }) => AppSearch;

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
  daily: Day[];
  comparison_daily: Day[];
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

export function OverviewFilters({ scope, org, workspace, workspaceNames, sets, brands, engines, request, revision, onChange, showBrand = true, summarize = true, lockSet = false }: {
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
  summarize?: boolean;
  showBrand?: boolean;
  lockSet?: boolean;
}) {
  const [error, setError] = useState("");
  const locationQuery = analyticsQuery({ ...scope, location: undefined, trackedBrand: undefined, compareBrand: undefined }, workspace);
  const locations = useReport<{ locations: string[] }>("/analytics/locations?" + locationQuery, request, revision);
  const activeSet = sets.find(set => set.id === scope.set);
  const activeBrand = brands.find(brand => brand.id === scope.trackedBrand);
  const activeFilters = [
    scope.from && scope.to && `${scope.from} to ${scope.to} UTC`,
    scope.set && `Prompt set: ${activeSet?.name ?? "Selected set"}`,
    scope.tags && `Tags: ${scope.tags.split(",").join(", ")}`,
    scope.engine && (engines[scope.engine] ?? scope.engine),
    scope.location && `Location: ${scope.location}`,
    showBrand && scope.trackedBrand && `Brand: ${activeBrand?.name ?? "Selected historical brand"}`,
  ].filter(Boolean);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const tags = splitPromptTags(String(data.tags ?? ""));
      if (tags.length > MAX_PROMPT_TAGS || tags.some(tag => !validPromptTag(tag)))
        throw new Error("Enter up to 20 tags of 1–50 characters each.");
      onChange(analyticsScope({ ...data, set: lockSet ? scope.set : data.set, compareBrand: scope.compareBrand, tags: tags.join(",") }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid tags");
    }
  }
  return <details className="advanced-settings mb-5">
    <summary className="break-words">{summarize ? "Filters" : "Edit report filters"}{summarize && activeFilters.length > 0 && <> · <span className="font-normal">{activeFilters.join(" · ")}</span></>}</summary>
    <form className="form-stack" onSubmit={apply}>
      <div className="form-grid">
        <label className="app-field"><span>From (UTC)</span>
          <input name="from" type="date" required defaultValue={scope.from} />
        </label>
        <label className="app-field"><span>Through (UTC)</span>
          <input name="to" type="date" required defaultValue={scope.to} />
        </label>
        {!lockSet && <label className="app-field"><span>Prompt set</span>
          <select name="set" defaultValue={scope.set ?? ""}>
            <option value="">All prompts</option>
            {scope.set && !activeSet && <option value={scope.set}>Selected set</option>}
            {sets.map(set => <option key={set.id} value={set.id}>{set.name}{workspace === "all" ? ` · ${workspaceNames[set.workspace_id]}` : ""}</option>)}
          </select>
        </label>}
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
        {showBrand && (brands.length > 0 || scope.trackedBrand) && <label className="app-field"><span>Tracked brand</span>
          <select name="trackedBrand" defaultValue={scope.trackedBrand ?? ""}>
            <option value="">{brands.length ? "Default brand" : "No tracked brand"}</option>
            {scope.trackedBrand && !activeBrand && <option value={scope.trackedBrand}>Selected historical brand</option>}
            {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
        </label>}
      </div>
      <div className="form-actions">
        <Button type="submit">Apply filters</Button>
        <Button type="button" variant="outline" onClick={event => { event.currentTarget.form?.reset(); setError(""); onChange(lockSet ? { set: scope.set } : {}); }}>Clear filters</Button>
      </div>
      {!lockSet && activeSet && <Link className="small-link" to="/app" search={{ org, workspace: activeSet.workspace_id, tab: "prompts", set: activeSet.id }}>View prompts in {activeSet.name}</Link>}
      {error && <p role="alert">{error}</p>}
    </form>
  </details>;
}

export function Overview({
  org, workspace, workspaceName, scope, brands, sets, engines, hasTrackedBrand, brandWorkspace, credentialsConnected, canWrite,
  canManageCredentials, request, revision, filters, trendMetric = "mention", reportLink, evidenceLink, reviewCollectionsLink, workspaceNames, emptyScope,
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
  trendMetric?: TrendMetric;
  reportLink?: (scope: AnalyticsScope, trendMetric: TrendMetric) => AppSearch;
  evidenceLink?: EvidenceLink;
  reviewCollectionsLink?: AppSearch;
  workspaceNames?: Record<string, string>;
  emptyScope?: ReactNode;
}) {
  const result = useReport<OverviewData>("/analytics?" + analyticsQuery(scope, workspace), request, revision);
  if (result?.error) return <><p role="alert">{result.error}</p>{filters}</>;
  if (!result?.data) return <p role="status">Calculating visibility…</p>;
  const data = result.data;
  if (!data.workspace_has_runs) {
    if (emptyScope) return <>{emptyScope}{filters}</>;
    const next = !hasTrackedBrand ? "brands" : !data.workspace_prompts ? "prompts"
      : !credentialsConnected ? "settings" : "collect";
    const steps = [
      { id: "brands", complete: hasTrackedBrand, tab: "brands", label: "Track a brand", action: "Add or assign brand",
        description: "Assign a brand to a workspace to measure mentions and citations.", permitted: canWrite },
      { id: "prompts", complete: !!data.workspace_prompts, tab: "prompts", label: "Save questions", action: "Open Prompts",
        description: "Choose the questions and engines you want to track.", permitted: canWrite },
      { id: "settings", complete: credentialsConnected, tab: "settings", label: "Connect DataForSEO", action: "Open Providers",
        description: "Connect your organization’s provider account to collect answers.", permitted: canManageCredentials },
      { id: "collect", complete: false, tab: "prompts", label: "Start a collection", action: "Choose variants",
        description: "Review and run saved combinations from Prompts.", permitted: canWrite },
    ] as const;
    return <>
      <Card><CardContent className="form-stack overview-setup">
        <div><h2>{next === "collect" ? "Ready to collect answers" : "Get ready to collect answers"}</h2>
          <p className="overview-scope">{workspaceName} · No runs in searchable history</p>
        </div>
        <ol>
          {steps.map(step => <li key={step.id}>
            <div><strong>{step.label}</strong><p className="overview-scope">{step.description}</p></div>
            {step.complete ? <span className="overview-scope">Complete</span>
              : step.permitted ? <Button size="sm" variant={step.id === next ? "default" : "outline"} asChild>
                <Link to="/app" search={{ org, workspace: step.id === "brands" ? brandWorkspace : workspace, tab: step.tab, ...(step.id === "settings" ? { settingsSection: "providers" as const } : {}) }}>{step.action}</Link>
              </Button> : <span className="overview-scope">{step.id === "settings" ? "Organization admin required" : "Editor access required"}</span>}
          </li>)}
        </ol>
      </CardContent></Card>
      {filters}
    </>;
  }
  const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" })
    .formatRange(new Date(data.from), new Date(data.to));
  const setName = sets.find(set => set.id === scope.set)?.name;
  const brandName = brands.find(brand => brand.id === scope.trackedBrand)?.name;
  const comparisonName = scope.compareBrand ? brands.find(brand => brand.id === scope.compareBrand)?.name ?? "Historical comparison brand" : undefined;
  const selectedBrand = scope.trackedBrand ? brandName ?? "Historical tracked brand" : undefined;
  const scopeLabel = [workspaceName, `${dateLabel} (UTC)`, scope.engine ? engines[scope.engine] : "All engines",
    selectedBrand ?? "No tracked brand", scope.set && (setName || "Selected prompt set"), scope.location,
    scope.tags && `Tags ${scope.tags}`].filter(Boolean).join(" · ");
  const toReport = (nextScope: AnalyticsScope, nextMetric = trendMetric): AppSearch =>
    reportLink?.(nextScope, nextMetric) ?? { ...nextScope, org, workspace, tab: "overview", trendMetric: nextMetric };
  const metricLink: EvidenceLink = evidenceLink ?? ((metric, day, row) => ({
    ...scope, org, workspace, tab: "runs", metric, trendMetric, evidenceDay: day,
    reportQuestion: row?.evidence_run_id, reportEngine: row?.engine,
  }));
  const availableHistory = toReport({
    set: scope.set, trackedBrand: scope.trackedBrand,
    from: data.workspace_first_run === null ? undefined : utcDay(data.workspace_first_run), to: utcDay(Date.now()),
  });
  const reviewCollections = reviewCollectionsLink ?? metricLink();
  const days = scope.compareBrand ? data.comparison_daily : data.daily;
  const totals = days.reduce((total, day) => ({
    samples: total.samples + day.samples,
    mentions: total.mentions + day.mentions,
    citations: total.citations + day.citations,
    compare_mentions: total.compare_mentions + (day.compare_mentions ?? 0),
    compare_citations: total.compare_citations + (day.compare_citations ?? 0),
  }), { samples: 0, mentions: 0, citations: 0, compare_mentions: 0, compare_citations: 0 });
  const metrics = [
    { label: "Brand mention rate", metric: "mention", comparison: "compare_mention", count: "mentions", comparisonCount: "compare_mentions",
      definition: "Share of eligible answers that mention the tracked brand." },
    { label: "Website citation rate", metric: "citation", comparison: "compare_citation", count: "citations", comparisonCount: "compare_citations",
      definition: "Share of eligible answers that cite the tracked brand’s website." },
  ] as const;
  const rate = (count: number) => totals.samples
    ? new Intl.NumberFormat(undefined, { style: "percent", maximumSignificantDigits: 3 }).format(count / totals.samples)
    : "No eligible answers";
  const formatCount = (count: number) => `${count.toLocaleString()} of ${totals.samples.toLocaleString()} eligible answers`;
  return <>
    <Card><CardContent className="overview-findings">
      <h2>Visibility findings</h2>
      <p className="overview-scope">{scopeLabel}</p>
      {!data.total_runs && (emptyScope ?? <p>No collections match these filters. <Link to="/app" search={availableHistory}>Show available history</Link></p>)}
      {filters}
      {selectedBrand && <>
        <p className="data-note">Eligible answers come from successful collections that recorded an AI answer and tracked {selectedBrand}
          {comparisonName && <> and {comparisonName} together</>}.</p>
        <dl className="overview-rates">
          {metrics.map(({ label, metric, comparison, count, comparisonCount, definition }) => <div key={metric}>
            <dt><strong>{label}</strong><p className="data-note">{definition}</p></dt>
            <dd><strong>{rate(totals[count])}</strong>
              <span>{formatCount(totals[count])}</span>
              <Link to="/app" search={metricLink(metric)}>View {comparisonName ? `${selectedBrand} evidence` : totals[count] ? "matching runs" : "evidence for this result"}</Link>
            </dd>
            {comparisonName && <dd><strong>{rate(totals[comparisonCount])}</strong>
              <span>{formatCount(totals[comparisonCount])}</span>
              <Link to="/app" search={metricLink(comparison)}>View {comparisonName} evidence</Link>
            </dd>}
          </div>)}
        </dl>
        <Link className="small-link" to="/app" search={metricLink("brand")}>View all {totals.samples.toLocaleString()} eligible answers for these rates</Link>
      </>}
    </CardContent></Card>
    {selectedBrand && <Card><CardContent>
      <div className="panel-title"><div><h2>Visibility over time</h2><p>Daily rates and underlying answers in UTC.</p></div>
        <div className="app-inline-form overview-trend-controls" aria-label="Trend metric">
          {metrics.map(({ metric, label }) => <Button key={metric} size="sm" variant="outline" asChild>
            <Link to="/app" search={toReport(scope, metric)} aria-current={trendMetric === metric ? "true" : undefined}>{label}</Link>
          </Button>)}
        </div>
      </div>
      {(comparisonName || brands.some(brand => brand.id !== scope.trackedBrand)) && <div className="app-inline-form">
        {comparisonName ? <>
          <p className="data-note">Comparing with {comparisonName} on answers that tracked both brands.</p>
          <Link to="/app" search={toReport({ ...scope, compareBrand: undefined })}>Remove comparison</Link>
        </> : <details><summary>Compare with another brand</summary><ul>
          {brands.filter(brand => brand.id !== scope.trackedBrand).map(brand =>
            <li key={brand.id}><Link to="/app" search={toReport({ ...scope, compareBrand: brand.id })}>{brand.name}</Link></li>)}
        </ul></details>}
      </div>}
      {!days.length ? <p className="data-note">{comparisonName ? "No eligible answers tracked both brands." : "No eligible answers in this period."}</p>
        : <DailyTrend days={days} from={data.from} to={data.to} metric={trendMetric} brand={selectedBrand} comparison={comparisonName} link={metricLink} />}
    </CardContent></Card>}
    <QuestionBreakdown key={JSON.stringify([org, workspace, scope])} scope={scope} workspace={workspace} request={request} revision={revision}
      totalRuns={data.total_runs} eligibleAnswers={data.eligible_answers}
      engines={engines} workspaceNames={workspaceNames} showWorkspace={workspace === "all"} brand={selectedBrand} comparison={comparisonName}
      link={metricLink} availableHistory={availableHistory} reviewCollections={reviewCollections}
      singleBrand={toReport({ ...scope, compareBrand: undefined })} />
    <Card><CardContent>
      <div className="panel-title"><div><h2>Collection coverage</h2><p>All runs in this scope, regardless of which brands they tracked.</p></div></div>
      <div className="app-inline-form overview-outcomes" aria-label="Collection outcomes">
        {([["pending", "Pending"], ["failed", "Failed"], ["uncertain", "Uncertain"], ["organic", "Organic only (no AI Overview)"],
          ["no_answer", "No AI answer or organic results"], ["eligible", "Eligible AI answers"]] as const)
          .map(([outcome, label]) => <Link key={outcome} to="/app" search={{ ...metricLink(), outcome: outcome === "no_answer" ? "no_evidence" : outcome }}>
            {label} ({data.outcomes[outcome] ?? 0})
          </Link>)}
      </div>
      <p className="data-note"><Link to="/app" search={metricLink("coverage")}>{data.covered_prompts} of {data.selected_prompts} selected questions produced an eligible AI answer</Link>.</p>
    </CardContent></Card>
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

function QuestionBreakdown({ scope, workspace, request, revision, totalRuns, eligibleAnswers, engines, workspaceNames, showWorkspace, brand, comparison, link, availableHistory, reviewCollections, singleBrand }: {
  scope: AnalyticsScope;
  workspace: string;
  request: RequestData;
  revision: unknown;
  totalRuns: number;
  eligibleAnswers: number;
  engines: Record<string, string>;
  workspaceNames?: Record<string, string>;
  showWorkspace: boolean;
  brand?: string;
  comparison?: string;
  link: EvidenceLink;
  availableHistory: AppSearch;
  reviewCollections: AppSearch;
  singleBrand: AppSearch;
}) {
  const [page, setPage] = useState(1);
  const query = analyticsQuery(scope, workspace);
  query.set("page", String(page));
  const result = useReport<{ questions: QuestionBreakdownRow[]; next_page: number | null }>(
    "/analytics/questions?" + query, request, revision,
  );
  const rows = result?.data?.questions ?? [];
  const columns: { label: string; field: keyof Pick<QuestionBreakdownRow, "eligible_answers" | "mentions" | "citations" | "compare_mentions" | "compare_citations">; metric: AnswerMetric }[] = [
    { label: "Eligible answers", field: "eligible_answers", metric: brand ? "brand" : "eligible" },
  ];
  if (brand) columns.push(
    { label: comparison ? `${brand} mentions` : "Brand mentions", field: "mentions", metric: "mention" },
    { label: comparison ? `${brand} website citations` : "Website citations", field: "citations", metric: "citation" },
  );
  if (comparison) columns.push(
    { label: `${comparison} mentions`, field: "compare_mentions", metric: "compare_mention" },
    { label: `${comparison} website citations`, field: "compare_citations", metric: "compare_citation" },
  );
  return <Card><CardContent>
    <h2>Contributing questions</h2>
    {result?.error ? <p role="alert">{result.error}</p>
      : !result?.data ? <p role="status">Loading contributing questions…</p>
      : page === 1 && !rows.length ? <p className="data-note">
      {!totalRuns ? <>No collections match this view. <Link to="/app" search={availableHistory}>Broaden the report filters</Link>.</>
        : !eligibleAnswers ? <>Matching collections recorded zero eligible AI answers. <Link to="/app" search={reviewCollections}>Review collection outcomes</Link>.</>
        : comparison ? <>No eligible answers tracked both brands. <Link to="/app" search={singleBrand}>Remove the comparison</Link>.</>
        : <>No eligible answers tracked {brand}. <Link to="/app" search={reviewCollections}>Review matching collections</Link>.</>}
    </p> : <>
      {comparison && <p className="data-note">Only answers that tracked both brands contribute to these counts.</p>}
      <ul className="divide-y">
        {rows.map(row => <li key={row.evidence_run_id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold">{row.question}</h3>
            <p className="data-note">{row.engine ? engines[row.engine] ?? row.engine : "Engine unavailable"}
              {showWorkspace && workspaceNames?.[row.workspace_id] && ` · ${workspaceNames[row.workspace_id]}`}</p>
          </div>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-x-4 gap-y-2 text-sm">
            {columns.map(({ label, field, metric }) => <div key={field} className="min-w-0">
              <dt className="break-words text-xs text-muted-foreground">{label}</dt>
              <dd className="tabular-nums">
                <Link to="/app" className="inline-flex min-h-8 items-center min-w-8 font-semibold underline! underline-offset-2 hover:text-primary pointer-coarse:min-h-11"
                  aria-label={`${row[field]} ${label.toLowerCase()} for ${row.question} on ${row.engine ? engines[row.engine] ?? row.engine : "the recorded engine"}`}
                  search={link(metric, undefined, { evidence_run_id: row.evidence_run_id, engine: row.engine ?? undefined })}>{row[field].toLocaleString()}</Link>
              </dd>
            </div>)}
          </dl>
        </li>)}
      </ul>
      {(page > 1 || result.data.next_page) && <div className="form-actions" aria-label="Contributing question pages">
        <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous questions</Button>
        <Button size="sm" variant="outline" disabled={!result.data.next_page} onClick={() => setPage(page + 1)}>Next questions</Button>
      </div>}
    </>}
  </CardContent></Card>;
}

function DailyTrend({ days, from, to, metric, brand, comparison, link }: {
  days: Day[];
  from: string;
  to: string;
  metric: TrendMetric;
  brand: string;
  comparison?: string;
  link: (metric: AnswerMetric, day: string) => AppSearch;
}) {
  const field = metric === "mention" ? "mentions" : "citations";
  const otherField = metric === "mention" ? "compare_mentions" : "compare_citations";
  const otherMetric = metric === "mention" ? "compare_mention" : "compare_citation";
  const label = metric === "mention" ? "brand mention rate" : "website citation rate";
  const first = Date.parse(from);
  const duration = Date.parse(to) - first;
  const points = days.map(day => ({
    ...day, x: duration ? 10 + 780 * (Date.parse(day.day) - first) / duration : 400,
    y: 170 - 160 * day[field] / day.samples,
    otherY: 170 - 160 * (day[otherField] ?? 0) / day.samples,
  }));
  return <>
    {comparison && <p className="data-note">{brand} (solid) · {comparison} (dashed)</p>}
    <div className="overview-trend">
      <div className="overview-trend-axis"><span>100%</span><span>50%</span><span>0%</span></div>
      <svg viewBox="0 0 800 180" preserveAspectRatio="none" role="img" aria-label={`Daily ${label}`}>
        <path d="M0 10H800M0 90H800M0 170H800" stroke="var(--border)" strokeDasharray="4 4" />
        <polyline points={points.map(p => `${p.x},${p.y}`).join(" ")} stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" />
        {comparison && <>
          <polyline points={points.map(p => `${p.x},${p.otherY}`).join(" ")} stroke="var(--foreground)" strokeDasharray="5 4" strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" />
          {points.map(point => <path key={point.day} d={`M${point.x} ${point.otherY}h0`} stroke="var(--foreground)"
            strokeWidth="11" strokeLinecap="round" vectorEffect="non-scaling-stroke">
            <title>{point.day} · {comparison} · {point[otherField]} of {point.samples}</title>
          </path>)}
        </>}
        {points.map(point => <path key={point.day} d={`M${point.x} ${point.y}h0`} stroke="var(--primary)"
          strokeWidth="7" strokeLinecap="round" vectorEffect="non-scaling-stroke">
          <title>{point.day} · {brand} · {point[field]} of {point.samples}</title>
        </path>)}
      </svg>
      <div className="overview-trend-dates"><span>{from}</span>{from !== to && <span>{to}</span>}</div>
    </div>
    <details><summary>View daily counts and matching runs</summary>
      {days.map(day => <div className="simple-row" key={day.day}>
        <time dateTime={day.day}>{day.day}</time>
        <Link to="/app" search={link(metric, day.day)}>{brand} · {day[field]} of {day.samples}</Link>
        {comparison && <Link to="/app" search={link(otherMetric, day.day)}>{comparison} · {day[otherField]} of {day.samples}</Link>}
        <Link to="/app" search={link("brand", day.day)}>All {day.samples} eligible answers</Link>
      </div>)}
    </details>
  </>;
}
