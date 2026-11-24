import { countLabel } from "@/lib/collection-labels";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { analyticsQuery, analyticsScope, DAY_MS, utcDay, type AnalyticsScope, type AnswerMetric, type TrendMetric } from "@/lib/analytics-filters";
import type { AppSearch } from "@/lib/app-location";
import { MAX_PROMPT_TAGS, splitPromptTags, validPromptTag } from "@/lib/prompt-tags";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BrandComparison, PeriodChange, type EngineBrand, type MentionShare, type PreviousPeriod, type ReportBrand } from "./competitive-report";
import type { PromptSet } from "./prompt-sets";

type Item = Record<string, any>;
type RequestData = (path: string) => Promise<Item>;
type Brand = ReportBrand;
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
  engine_brands: EngineBrand[];
  brands: (Counts & { id: string; name: string | null })[];
  individual_coverage: { id: string; samples: number }[];
  previous_period: PreviousPeriod;
  mention_share: MentionShare | null;
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
  const locationQuery = analyticsQuery({ ...scope, location: undefined, trackedBrand: undefined, compareBrand: undefined, overlap: undefined }, workspace);
  const locations = useReport<{ locations: string[] }>("/analytics/locations?" + locationQuery, request, revision);
  const activeSet = sets.find(set => set.id === scope.set);
  const activeBrand = brands.find(brand => brand.id === scope.trackedBrand);
  const activeFilters = [
    scope.from && scope.to && `${scope.from} to ${scope.to} UTC`,
    scope.set && `Tracking set: ${activeSet?.name ?? "Selected set"}`,
    scope.tags && `Tags: ${scope.tags.split(",").join(", ")}`,
    scope.engine && (engines[scope.engine] ?? scope.engine),
    scope.location && `Location: ${scope.location}`,
    scope.matchFrom && `Matched to ${scope.matchFrom} – ${scope.matchTo}`,
    showBrand && scope.trackedBrand && `Brand: ${activeBrand?.name ?? "Selected historical brand"}`,
  ].filter(Boolean);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const tags = splitPromptTags(String(data.tags ?? ""));
      if (tags.length > MAX_PROMPT_TAGS || tags.some(tag => !validPromptTag(tag)))
        throw new Error("Enter up to 20 tags of 1–50 characters each.");
      onChange(analyticsScope({ ...data, trackedBrand: showBrand ? data.trackedBrand : scope.trackedBrand, set: lockSet ? scope.set : data.set, compareBrand: scope.compareBrand, overlap: scope.overlap, matchFrom: data.from === scope.from && data.to === scope.to ? scope.matchFrom : undefined, matchTo: data.from === scope.from && data.to === scope.to ? scope.matchTo : undefined, tags: tags.join(",") }));
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
        {!lockSet && <label className="app-field"><span>Tracking set</span>
          <select name="set" defaultValue={scope.set ?? ""}>
            <option value="">All prompts</option>
            {scope.set && !activeSet && <option value={scope.set}>Selected set</option>}
            {sets.map(set => <option key={set.id} value={set.id}>{set.name}{workspace === "all" ? ` · ${workspaceNames[set.workspace_id]}` : ""}</option>)}
          </select>
        </label>}
        <label className="app-field"><span>Tags · match all</span>
          <input name="tags" defaultValue={scope.tags} maxLength={1020} placeholder="consideration, small teams" />
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
  canManageCredentials, request, revision, filters, trendMetric = "mention", reportLink, evidenceLink, workspaceNames, emptyScope, automaticBrand = false,
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
  workspaceNames?: Record<string, string>;
  emptyScope?: ReactNode;
  automaticBrand?: boolean;
}) {
  const result = useReport<OverviewData>("/analytics?" + analyticsQuery(scope, workspace), request, revision);
  const navigate = useNavigate({ from: "/app" });
  const observed = result?.data?.engine_brands;
  const fallbackId = automaticBrand && observed?.length && !observed.some(row => row.id === scope.trackedBrand)
    ? (brands.find(brand => brand.kind !== "competitor" && observed.some(row => row.id === brand.id))?.id ??
       brands.find(brand => observed.some(row => row.id === brand.id))?.id ?? observed[0].id) : undefined;
  useEffect(() => {
    if (fallbackId) void navigate({ search: previous => ({ ...previous, trackedBrand: fallbackId, compareBrand: undefined }), replace: true });
  }, [fallbackId, navigate]);
  if (result?.error) return <><p role="alert">{result.error}</p>{filters}</>;
  if (!result?.data) return <p role="status">Calculating visibility…</p>;
  const data = result.data;
  if (!data.total_runs && emptyScope) return <>{emptyScope}{filters}</>;
  if (!data.workspace_has_runs) {
    const next = !hasTrackedBrand ? "brands" : !data.workspace_prompts ? "prompts"
      : !credentialsConnected ? "settings" : "collect";
    const steps = [
      { id: "brands", complete: hasTrackedBrand, tab: "brands", label: "Track a brand", action: "Add or assign brand",
        description: "Assign a brand to a workspace to measure mentions and citations.", permitted: canWrite },
      { id: "prompts", complete: !!data.workspace_prompts, tab: "prompts", label: "Save questions", action: "Add prompts",
        description: "Choose the questions and engines you want to track.", permitted: canWrite },
      { id: "settings", complete: credentialsConnected, tab: "settings", label: "Connect DataForSEO", action: "Open Providers",
        description: "Connect your organization’s provider account to collect answers.", permitted: canManageCredentials },
      { id: "collect", complete: false, tab: "prompts", label: "Start a collection", action: "Choose variants",
        description: "Review and run saved combinations from Prompts.", permitted: canWrite },
    ] as const;
    const nextStep = steps.find(step => step.id === next)!;
    return <>
      <Card><CardContent className="form-stack overview-setup">
        <div><h2>{next === "collect" ? "Ready to collect answers" : "Get ready to collect answers"}</h2>
          <p className="overview-scope">{workspaceName} · No runs in searchable history</p>
        </div>
        <ol>
          {[nextStep, ...steps.filter(step => step.id !== next)].map(step => <li key={step.id}>
            <div><strong>{step.label}</strong><p className="overview-scope">{step.description}</p></div>
            {step.complete ? <span className="overview-scope">Complete</span>
              : step.permitted ? <Button size="sm" variant={step.id === next ? "default" : "outline"} asChild>
                <Link to="/app" search={{ org, workspace: step.id === "brands" ? brandWorkspace : workspace, tab: step.tab, ...(step.id === "prompts" ? { promptView: "create" as const } : {}), ...(step.id === "settings" ? { settingsSection: "providers" as const } : {}) }}>{step.action}</Link>
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
  const nameFor = (id?: string) => brands.find(brand => brand.id === id)?.name ?? data.brands.find(row => row.id === id)?.name;
  const brandName = nameFor(scope.trackedBrand);
  const comparisonName = scope.compareBrand ? nameFor(scope.compareBrand) ?? "Historical comparison brand" : undefined;
  const selectedBrand = scope.trackedBrand ? brandName ?? "Historical tracked brand" : undefined;
  const scopeLabel = [workspaceName, `${dateLabel} (UTC)`, scope.engine ? engines[scope.engine] : "All engines",
    selectedBrand ?? "No tracked brand", scope.set && (setName || "Selected tracking set"), scope.location,
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
  const days = scope.compareBrand ? data.comparison_daily : data.daily;
  const totals = days.reduce((total, day) => ({
    samples: total.samples + day.samples,
    mentions: total.mentions + day.mentions,
    citations: total.citations + day.citations,
    compare_mentions: total.compare_mentions + (day.compare_mentions ?? 0),
    compare_citations: total.compare_citations + (day.compare_citations ?? 0),
  }), { samples: 0, mentions: 0, citations: 0, compare_mentions: 0, compare_citations: 0 });
  const metrics = [
    { label: "Mention rate", metric: "mention", count: "mentions", comparisonCount: "compare_mentions" },
    { label: "Citation rate", metric: "citation", count: "citations", comparisonCount: "compare_citations" },
  ] as const;
  const individualCoverageAvailable = data.individual_coverage.some(row => row.samples > 0);
  const activeLabel = trendMetric === "mention" ? "Mention rate" : "Citation rate";
  const comparisonBrands = [...brands, ...data.brands.filter(row => row.name && !brands.some(brand => brand.id === row.id))
    .map(row => ({ id: row.id, name: row.name! + " · Recorded brand" }))];
  const comparison = <BrandComparison rows={data.engine_brands} brands={comparisonBrands} individualCoverage={data.individual_coverage} engines={engines} scope={scope}
    metric={trendMetric} mentionShare={data.mention_share} toReport={toReport} evidence={metricLink} sources={{ ...scope, org, workspace, tab: "research" }} />;
  return <>
    <Card><CardContent className="overview-findings">
      <div className="panel-title"><div><h2>Visibility</h2><p className="overview-scope">{scopeLabel}</p></div>
        <nav className="report-period-shortcuts" aria-label="Reporting period">
          {[7, 30].map(length => {
            const today = utcDay(Date.now());
            const from = utcDay(Date.parse(today) - (length - 1) * DAY_MS);
            return <Link key={length} to="/app" aria-current={scope.from === from && scope.to === today ? "true" : undefined}
              search={toReport({ ...scope, from, to: today, matchFrom: undefined, matchTo: undefined })}>Last {length} days</Link>;
          })}
          <a href={"/api/v1/analytics/export?" + new URLSearchParams({ ...Object.fromEntries(analyticsQuery(scope, workspace)), org })}>
            Export report CSV
          </a>
        </nav>
      </div>
      {filters}
      {scope.matchFrom && <p className="data-note">Matching questions and engines observed {scope.matchFrom} – {scope.matchTo} UTC.</p>}
      {!data.total_runs && !individualCoverageAvailable ? <p>No collections match these filters. <Link to="/app" search={availableHistory}>Show available history</Link>.</p>
        : !data.eligible_answers && !individualCoverageAvailable ? <p>No AI answers were recorded in these collections. <a href="#overview-collection-coverage">Review collection outcomes</a>.</p>
        : !selectedBrand ? <><p>No brand is selected. <Link to="/app" search={metricLink("eligible")}>{collectedAnswersLabel(data.eligible_answers)}</Link></p>{comparison}</>
        : !totals.samples ? <>
          <p>{comparisonName ? "No answers tracked both brands." : `No collected answers tracked ${selectedBrand}.`}
            {" "}{data.eligible_answers > 0 && <Link to="/app" search={metricLink("eligible")}>{collectedAnswersLabel(data.eligible_answers)}</Link>}
          </p>
          {scope.matchFrom && <Link className="small-link" to="/app" search={toReport({ ...scope, matchFrom: undefined, matchTo: undefined })}>Include all question and engine combinations</Link>}
          {comparison}
          {!data.engine_brands.length && canWrite && <Link className="small-link" to="/app" search={{ org, workspace: brandWorkspace, tab: "brands" }}>Manage brands for future checks</Link>}
        </> : <>
          {comparisonName && <p className="data-note">{selectedBrand} compared with {comparisonName}</p>}
          <nav className="overview-rates" aria-label="Visibility metric">
            {metrics.map(({ label, metric, count, comparisonCount }) => <Link key={metric} to="/app"
              search={toReport(scope, metric)} aria-current={trendMetric === metric ? "true" : undefined}>
              <span>{label}</span>
              <strong>{formatRate(totals[count], totals.samples)}{comparisonName && ` / ${formatRate(totals[comparisonCount], totals.samples)}`}</strong>
              <span>{totals[count].toLocaleString()}{comparisonName && ` / ${totals[comparisonCount].toLocaleString()}`} of {answerCount(totals.samples)}</span>
            </Link>)}
          </nav>
          <p className="data-note">
            {trendMetric === "mention" ? `Answers that mention ${selectedBrand}` : `Answers that cite ${selectedBrand}’s website`}
            {comparisonName && ` or ${comparisonName}`}. Rates use successful AI answers that tracked {comparisonName ? "both brands" : selectedBrand}.
            {" "}<Link to="/app" search={metricLink(trendMetric)}>View {countLabel(trendMetric === "mention" ? totals.mentions : totals.citations, trendMetric)}{comparisonName && ` for ${selectedBrand}`}</Link>
            {comparisonName && <> · <Link to="/app" search={metricLink(trendMetric === "mention" ? "compare_mention" : "compare_citation")}>
              View {countLabel(trendMetric === "mention" ? totals.compare_mentions : totals.compare_citations, trendMetric)} for {comparisonName}</Link></>}
            {" · "}<Link to="/app" search={metricLink("brand")}>View all {answerCount(totals.samples, "eligible ")}</Link>.
          </p>
          <PeriodChange previous={data.previous_period} metric={trendMetric} samples={totals.samples}
            count={trendMetric === "mention" ? totals.mentions : totals.citations} evidence={metricLink()} report={toReport} scope={scope}
            brand={selectedBrand} comparison={comparisonName} comparisonCount={trendMetric === "mention" ? totals.compare_mentions : totals.compare_citations} />
          <div className="overview-comparison-grid">
            <section aria-label={`Daily ${activeLabel.toLowerCase()}`}>
              <h3 className="font-semibold">{activeLabel} over time</h3>
              <DailyTrend days={days} from={data.from} to={data.to} metric={trendMetric} brand={selectedBrand} comparison={comparisonName} link={metricLink} />
            </section>
            {comparison}
          </div>
        </>}
    </CardContent></Card>
    <Card><CardContent>
      <div className="panel-title"><div><h2 id="overview-collection-coverage" tabIndex={-1}>Collection coverage</h2><p>All runs in this scope, regardless of which brands they tracked.</p></div></div>
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
    {selectedBrand && totals.samples > 0 && <Card><CardContent>
      <QuestionBreakdown key={JSON.stringify([org, workspace, scope, trendMetric])} scope={scope} workspace={workspace}
        request={request} revision={revision} engines={engines} workspaceNames={workspaceNames} showWorkspace={workspace === "all"}
        brand={selectedBrand} comparison={comparisonName} metric={trendMetric} link={metricLink} />
    </CardContent></Card>}
  </>;
}

const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumSignificantDigits: 3 });
const formatRate = (count: number, samples: number) => percent.format(count / samples);
const answerCount = (count: number, description = "") => `${count.toLocaleString()} ${description}${count === 1 ? "answer" : "answers"}`;
const collectedAnswersLabel = (count: number) => `View ${answerCount(count, "collected ")}`;

function QuestionBreakdown({ scope, workspace, request, revision, engines, workspaceNames, showWorkspace, brand, comparison, metric, link }: {
  scope: AnalyticsScope;
  workspace: string;
  request: RequestData;
  revision: unknown;
  engines: Record<string, string>;
  workspaceNames?: Record<string, string>;
  showWorkspace: boolean;
  brand: string;
  comparison?: string;
  metric: TrendMetric;
  link: EvidenceLink;
}) {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const query = analyticsQuery(scope, workspace);
  query.set("sort", metric === "mention" ? "mentions" : "citations");
  query.set("page", String(page));
  const result = useReport<{ questions: QuestionBreakdownRow[]; next_page: number | null }>(
    "/analytics/questions?" + query, request, revision,
  );
  const rows = result?.data?.questions ?? [];
  const label = metric === "mention" ? "Mention rate" : "Citation rate";
  const columns = [
    { brand, field: metric === "mention" ? "mentions" : "citations", metric },
    ...(comparison ? [{
      brand: comparison, field: metric === "mention" ? "compare_mentions" : "compare_citations",
      metric: metric === "mention" ? "compare_mention" : "compare_citation",
    }] as const : []),
  ] as const;
  return <section className="overview-questions" aria-labelledby="overview-questions-title">
    <h3 id="overview-questions-title" className="font-semibold">Contributing questions</h3>
    {result?.error ? <p role="alert">{result.error}</p>
      : !result?.data ? <p role="status">Loading contributing questions…</p>
      : !rows.length ? <p className="data-note">No contributing questions on this page.</p> : <>
      <div className="overview-question-grid overview-question-head" aria-hidden="true">
        <span>Question</span><span>{label}</span><span>Engine</span>
      </div>
      <ul>
        {(expanded ? rows : rows.slice(0, 3)).map(row => {
          const rowScope = { evidence_run_id: row.evidence_run_id, engine: row.engine ?? undefined };
          const engineName = row.engine ? engines[row.engine] ?? row.engine : "Engine unavailable";
          return <li key={row.evidence_run_id} className="overview-question-grid">
            <h4 className="font-medium">{row.question}</h4>
            <dl className="tabular-nums">
              {columns.map(column => {
                const count = row[column.field];
                const samples = row.eligible_answers;
                return <div key={column.field}>
                  <dt className={comparison ? "data-note" : "sr-only"}>{comparison ? column.brand : label}</dt>
                  <dd className="overview-question-rate">
                    <strong>{formatRate(count, samples)}</strong>
                    <Link to="/app"
                      aria-label={count
                        ? `View the ${count} matching answers of ${samples} eligible for ${column.brand}, ${row.question} on ${engineName}`
                        : `View all ${samples} eligible answers for ${row.question} on ${engineName} (${label.toLowerCase()} 0%)`}
                      search={link(count ? column.metric : "brand", undefined, rowScope)}>{count.toLocaleString()} / {samples.toLocaleString()}</Link>
                    {count > 0 && count < samples && <Link className="overview-all-answers" to="/app"
                      aria-label={`View all ${samples} eligible answers for ${row.question} on ${engineName}`}
                      search={link("brand", undefined, rowScope)}>All {samples.toLocaleString()}</Link>}
                  </dd>
                </div>;
              })}
            </dl>
            <p className="data-note">{engineName}{showWorkspace && workspaceNames?.[row.workspace_id] && ` · ${workspaceNames[row.workspace_id]}`}</p>
          </li>;
        })}
      </ul>
      {(rows.length > 3 || page > 1 || result.data.next_page) && <Button size="sm" variant="outline"
        aria-expanded={expanded} onClick={() => { setExpanded(!expanded); setPage(1); }}>
        {expanded ? "Show fewer questions" : "View all contributing questions"}
      </Button>}
      {expanded && (page > 1 || result.data.next_page) && <div className="form-actions" aria-label="Contributing question pages">
        <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous questions</Button>
        <Button size="sm" variant="outline" disabled={!result.data.next_page} onClick={() => setPage(page + 1)}>Next questions</Button>
      </div>}
    </>}
  </section>;
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
        <Link to="/app" search={link("brand", day.day)}>All {answerCount(day.samples, "eligible ")}</Link>
      </div>)}
    </details>
  </>;
}
