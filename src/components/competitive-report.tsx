import { Link } from "@tanstack/react-router";
import { utcDay, type AnalyticsScope, type AnswerMetric, type TrendMetric } from "@/lib/analytics-filters";
import type { AppSearch } from "@/lib/app-location";

export type ReportBrand = { id: string; name: string; kind?: string; domain?: string };
export type EngineBrand = { engine: NonNullable<AnalyticsScope["engine"]>; id: string; name: string | null; samples: number; mentions: number; citations: number };
export type PreviousPeriod = {
  from: string; to: string; complete: boolean; samples: number;
  mentions: number; citations: number; compare_mentions: number; compare_citations: number;
  question_mix_changed: boolean; engine_mix_changed: boolean;
};

const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });
const points = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, signDisplay: "exceptZero" });

export function PeriodChange({ previous, metric, samples, count, evidence, report, scope, brand, comparison, comparisonCount }: {
  previous: PreviousPeriod; metric: TrendMetric; samples: number; count: number; evidence: AppSearch; report: (scope: AnalyticsScope) => AppSearch; scope: AnalyticsScope;
  brand: string; comparison?: string; comparisonCount: number;
}) {
  const then = metric === "mention" ? previous.mentions : previous.citations;
  const otherThen = metric === "mention" ? previous.compare_mentions : previous.compare_citations;
  const rows = [{ label: brand, current: count, prior: then, metric },
    ...(comparison ? [{ label: comparison, current: comparisonCount, prior: otherThen,
      metric: metric === "mention" ? "compare_mention" as const : "compare_citation" as const }] : [])];
  return <div className="change-summary">
    <span>Previous period · {previous.from} – {previous.to} UTC</span>
    {!previous.complete ? <strong>Incomplete comparison window</strong>
      : !previous.samples ? <strong>No eligible answers</strong>
      : rows.map(row => <div key={row.metric} className="period-change-row">
        <strong>{row.label} · {points.format(100 * (row.current / samples - row.prior / previous.samples))} percentage points</strong>
        <Link className="small-link" to="/app" search={{ ...evidence, metric: row.prior ? row.metric : "brand",
          from: previous.from, to: previous.to, matchFrom: scope.matchFrom ? scope.from : undefined, matchTo: scope.matchTo ? scope.to : undefined }}>
          {row.prior} / {previous.samples} in previous period
        </Link>
      </div>)}
    {scope.to && scope.to >= utcDay(Date.now()) && <span>Current period is still in progress.</span>}
    {previous.engine_mix_changed && <span>Engine mix changed.</span>}
    {previous.question_mix_changed && <span>Question mix changed.</span>}
    {scope.matchFrom ? <Link className="small-link" to="/app" search={report({ ...scope, matchFrom: undefined, matchTo: undefined })}>
      Include all question and engine combinations
    </Link> : previous.complete && previous.samples > 0 && <Link className="small-link" to="/app"
      search={report({ ...scope, matchFrom: previous.from, matchTo: previous.to })}>
      Compare matching questions and engines
    </Link>}
  </div>;
}

export type MentionShare = { credited_mentions: number; brands: { id: string; mentions: number; share: number | null }[] };
export function BrandComparison({ rows, brands, engines, scope, metric, toReport, evidence, sources, mentionShare }: {
  mentionShare: MentionShare | null;
  rows: EngineBrand[];
  brands: ReportBrand[];
  engines: Record<string, string>;
  scope: AnalyticsScope;
  metric: TrendMetric;
  toReport: (scope: AnalyticsScope) => AppSearch;
  evidence: (metric: AnswerMetric) => AppSearch;
  sources: AppSearch;
}) {
  const present = new Set(rows.map(row => row.id));
  const brandName = (id: string) => brands.find(brand => brand.id === id)?.name ?? rows.find(row => row.id === id)?.name ?? `Historical brand (${id})`;
  const ids = Array.from(present).sort((a, b) => a === scope.trackedBrand ? -1 : b === scope.trackedBrand ? 1 : brandName(a).localeCompare(brandName(b)));
  const engineIds = Object.keys(engines).filter(id => rows.some(row => row.engine === id));
  const field = metric === "mention" ? "mentions" : "citations";
  const paired = !!scope.compareBrand;
  const brandMentions = (id: string) => mentionShare?.brands.find(brand => brand.id === id)?.mentions ?? 0;
  const totalMentions = mentionShare?.credited_mentions ?? 0;
  const selectedName = scope.trackedBrand && brandName(scope.trackedBrand);
  const competitorName = scope.compareBrand && brandName(scope.compareBrand);
  const alternatives = brands.filter(brand => brand.id !== scope.trackedBrand);
  return <section className="comparison-report" aria-labelledby="brand-comparison-heading">
    <header className="panel-title"><div>
      <h3 id="brand-comparison-heading">Brands by engine</h3>
      <p className="data-note">{paired
        ? `Answers that tracked both ${selectedName} and ${competitorName}.`
        : "Each fraction uses answers that tracked that brand. Choose a comparison to use the same answers for both brands."}</p>
    </div></header>
    {(scope.trackedBrand && (alternatives.length > 0 || paired)) && <nav className="compare-choices" aria-label="Comparison brand">
      <span>Compare {selectedName} with</span>
      {alternatives.map(brand => <Link key={brand.id} to="/app" aria-current={scope.compareBrand === brand.id ? "true" : undefined}
        search={toReport({ ...scope, compareBrand: brand.id })}>{brand.name}</Link>)}
      {paired && <Link className="small-link" to="/app" search={toReport({ ...scope, compareBrand: undefined })}>Remove comparison</Link>}
    </nav>}
    {!!rows.length && <div className="overflow-x-auto" role="region" aria-label="Brand and engine rates" tabIndex={0}>
      <table className="comparison-table"><thead><tr><th scope="col">Tracked brand</th>
        {engineIds.map(engine => <th key={engine} scope="col">{engines[engine]}</th>)}
        {paired && <th scope="col">Share of mentions</th>}
      </tr></thead><tbody>{ids.map(id => <tr key={id}>
        <th scope="row"><Link to="/app" search={toReport({ ...scope, trackedBrand: id, compareBrand: undefined })}>{brandName(id)}</Link></th>
        {engineIds.map(engine => {
          const row = rows.find(row => row.id === id && row.engine === engine);
          if (!row?.samples) return <td key={engine}><span className="data-note">No observations</span></td>;
          const compare = paired && id === scope.compareBrand;
          const targetMetric = row[field] ? (compare ? metric === "mention" ? "compare_mention" : "compare_citation" : metric) : "brand";
          return <td key={engine}><Link to="/app" search={{ ...evidence(targetMetric), engine: row.engine,
            trackedBrand: paired ? scope.trackedBrand : id, compareBrand: scope.compareBrand }}
            aria-label={`${brandName(id)}, ${engines[engine]}, ${row[field]} of ${row.samples} answers. View ${row[field] ? "matches" : "eligible answers"}`}>
              <strong>{percent.format(row[field] / row.samples)}</strong><span>{row[field]} / {row.samples}</span>
          </Link></td>;
        })}
        {paired && <td>{totalMentions ? <Link to="/app" search={evidence(brandMentions(id) ? id === scope.compareBrand ? "compare_mention" : "mention" : "brand")}>
          <strong>{percent.format(brandMentions(id) / totalMentions)}</strong><span>{brandMentions(id)} / {totalMentions}</span>
        </Link> : <span className="data-note">No mentions</span>}</td>}
      </tr>)}</tbody></table>
    </div>}
    {paired && <div className="mt-3">
      <p className="data-note">Share of mentions counts each brand once per answer. An answer naming both contributes two mentions.</p>
      <Link className="small-link" to="/app" search={{ ...sources, overlap: "competitor_only" }}>
        Sources where {competitorName} was mentioned and {selectedName} was absent
      </Link>
    </div>}
  </section>;
}
