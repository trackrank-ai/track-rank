import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DAY_MS, utcDay } from "@/lib/analytics-filters";
import type { AppSearch } from "@/lib/app-location";
import type { ResearchSummary } from "./research-results";
import type { ReportBrand } from "./competitive-report";

const overlapLabels = {
  all: "All answers tracking both brands",
  competitor_only: "Comparison brand only",
  client_only: "Primary brand only",
  both: "Both mentioned",
  neither: "Neither mentioned",
} as const;

export function sourceBrandPair(brands: ReportBrand[], search: AppSearch) {
  const primary = search.trackedBrand ?? (brands.find(brand => brand.kind !== "competitor") ?? brands[0])?.id;
  const comparison = search.compareBrand ?? (brands.find(brand => brand.kind === "competitor" && brand.id !== primary) ?? brands.find(brand => brand.id !== primary))?.id;
  return { primary, comparison };
}

export function SourceComparison({ brands, search, coverage }: { brands: ReportBrand[]; search: AppSearch; coverage?: ResearchSummary["comparison_coverage"] }) {
  const navigate = useNavigate({ from: "/app" });
  const [error, setError] = useState("");
  const { primary: selected, comparison: other } = sourceBrandPair(brands, search);
  const options = [...brands];
  for (const id of [selected, other]) {
    if (id && !options.some(brand => brand.id === id)) options.push({ id, name: id === selected ? "Historical primary brand" : "Historical comparison brand" });
  }
  if (options.length < 2) return null;
  const name = (id?: string) => options.find(brand => brand.id === id)?.name;
  const target = { ...search, sourcePage: undefined, sourceDetailPage: undefined, sourceBrandPage: undefined,
    sourceQuestion: undefined, sourceDomainPage: undefined };
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const trackedBrand = String(data.get("primary"));
    const compareBrand = String(data.get("comparison"));
    const overlap = String(data.get("overlap")) as keyof typeof overlapLabels;
    if (trackedBrand === compareBrand) { setError("Choose two different brands."); return; }
    setError("");
    void navigate({ search: { ...target, trackedBrand, compareBrand, overlap } });
  }
  return <section className="source-cohort" aria-label="Source comparison">
    {!search.overlap && !!coverage?.shared_answers && selected && other && <Link className="small-link" to="/app"
      search={{ ...target, trackedBrand: selected, compareBrand: other, overlap: "competitor_only" }}>
      Sources in answers mentioning {name(other)} without {name(selected)}
    </Link>}
    {coverage && !coverage.shared_answers && <p className="data-note">No eligible answers tracked both brands in this scope. {name(coverage.primary)} was measured in {coverage.primary_answers} answers and {name(coverage.comparison)} in {coverage.comparison_answers}.</p>}
    <details className="advanced-settings mb-4">
    <summary>Compare brand mentions{search.overlap && ` · ${name(selected)} / ${name(other)} · ${overlapLabels[search.overlap]}`}</summary>
    <form className="form-stack" onSubmit={apply}>
      <div className="form-grid">
        {([["primary", "Primary brand", selected], ["comparison", "Comparison brand", other]] as const).map(([key, label, defaultId]) =>
          <label key={key} className="app-field"><span>{label}</span>
            <select name={key} defaultValue={defaultId}>{options.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>
          </label>)}
        <label className="app-field"><span>Answers mentioning</span>
          <select name="overlap" defaultValue={search.overlap ?? "competitor_only"}>
            {Object.entries(overlapLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>
      <p className="data-note">Only answers that tracked both brands at collection time qualify.</p>
      <div className="form-actions"><Button size="sm" type="submit">Apply comparison</Button>
        {search.overlap && <Button size="sm" asChild variant="outline"><Link to="/app"
          search={{ ...target, trackedBrand: undefined, compareBrand: undefined, overlap: undefined }}>Show all answers</Link></Button>}
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  </details></section>;
}

export type DomainDay = { domain: string; day: string; answers: number };
const seriesStyles = [
  { color: "var(--primary)", dash: undefined },
  { color: "var(--foreground)", dash: "7 4" },
  { color: "var(--muted-foreground)", dash: "2 3" },
];

export function DomainTrends({ rows, search }: { rows: DomainDay[]; search: AppSearch }) {
  if (!rows.length) return null;
  const domains = [...new Set(rows.map(row => row.domain))];
  const days = rows.map(row => row.day).sort();
  const from = search.from ?? days[0];
  const to = search.to ?? days[days.length - 1];
  const first = Date.parse(from);
  const last = Date.parse(to);
  const bucketDays = Math.max(1, Math.ceil((last - first + DAY_MS) / DAY_MS / 100));
  const bucketSize = bucketDays * DAY_MS;
  const dates = Array.from({ length: Math.floor((last - first) / bucketSize) + 1 }, (_, index) => utcDay(first + index * bucketSize));
  const counts = new Map(domains.map(domain => [domain, new Array<number>(dates.length).fill(0)]));
  for (const row of rows) {
    const index = Math.floor((Date.parse(row.day) - first) / bucketSize);
    if (index >= 0 && index < dates.length) counts.get(row.domain)![index] += row.answers;
  }
  const peak = Math.max(1, ...[...counts.values()].flat());
  const x = (i: number) => dates.length === 1 ? 400 : 10 + 780 * i / (dates.length - 1);
  const y = (n: number) => 115 - 108 * n / peak;
  return <section className="domain-trends" aria-label="Leading cited domains over time">
    <h3 className="font-semibold">Leading cited domains</h3>
    <p className="data-note">Distinct answers citing each domain{bucketDays > 1 ? ` per ${bucketDays}-day interval` : " per day"}.</p>
    <div className="overview-trend">
      <div className="overview-trend-axis"><span>{peak}</span><span>0</span></div>
      <svg viewBox="0 0 800 124" preserveAspectRatio="none" role="img" aria-label="Citation counts by date. Exact counts are available in the table below.">
        <path d="M0 7H800M0 115H800" stroke="var(--border)" strokeDasharray="4 4" />
        {domains.map((domain, index) => {
          const style = seriesStyles[index % seriesStyles.length];
          const countsForDomain = counts.get(domain)!;
          return <g key={domain} stroke={style.color}>
            <polyline fill="none" vectorEffect="non-scaling-stroke" strokeDasharray={style.dash} strokeWidth="2"
              points={countsForDomain.map((n, i) => `${x(i)},${y(n)}`).join(" ")} />
            {countsForDomain.map((n, i) => n > 0 && <path key={i} vectorEffect="non-scaling-stroke" d={`M${x(i)} ${y(n)}h0`}
              strokeLinecap="round" strokeWidth="5"><title>{domain} · {dates[i]} · {n}</title></path>)}
          </g>;
        })}
      </svg>
      <div className="overview-trend-dates"><span>{from}</span>{to !== from && <span>{to}</span>}</div>
    </div>
    <div className="app-inline-form">{domains.map((domain, i) => <Link key={domain} className="small-link" to="/app"
      search={{ ...search, researchType: "domain", researchValue: domain }}>
      <svg width="18" height="8" aria-hidden="true"><path d="M0 4H18" stroke={seriesStyles[i % 3].color} strokeWidth="2" strokeDasharray={seriesStyles[i % 3].dash}/></svg>{domain}
    </Link>)}</div>
    <details className="mt-2"><summary>View counts by date</summary>
      <div className="source-daily-counts overflow-auto" role="region" tabIndex={0} aria-label="Citation trend data">
        <table className="source-table"><thead><tr><th scope="col">Interval start (UTC)</th>{domains.map(domain => <th key={domain} scope="col">{domain}</th>)}</tr></thead>
          <tbody>{dates.map((day, i) => <tr key={day}><th scope="row">{day}</th>{domains.map(domain => <td key={domain}>{counts.get(domain)![i]}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
