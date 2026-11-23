import { Link } from "@tanstack/react-router";
import { sourceReturnSearch } from "@/lib/source-report";
import type { AppSearch } from "@/lib/app-location";
import type { ReportBrand } from "./competitive-report";

export function SourceOrigin({ search, brands, engines }: {
  search: AppSearch; brands: ReportBrand[]; engines: Record<string, string>;
}) {
  const origin = sourceReturnSearch(search);
  if (!origin) return null;
  const compared = origin.metric?.startsWith("compare_");
  const brand = brands.find(item => item.id === (compared ? origin.compareBrand : origin.trackedBrand ?? origin.brand))?.name;
  const engine = origin.engine ?? origin.reportEngine ?? origin.promptEngine;
  const metric = origin.metric ?? origin.questionMetric;
  const group = metric?.endsWith("mention") ? `Answers mentioning ${brand ?? "the selected brand"}`
    : metric?.endsWith("citation") ? `Answers citing ${brand ?? "the selected brand"}`
    : brand ? `Answers tracking ${brand}` : "Eligible answers";
  const date = origin.evidenceDay ?? (search.from && search.to ? `${search.from} – ${search.to}` : undefined);
  const wider: AppSearch = { org: search.org, workspace: search.workspace, from: search.from, to: search.to,
    tab: "research", researchType: search.researchType, researchValue: search.researchValue, researchGroup: search.researchGroup,
    sourceScope: "all", sourceReturn: search.sourceReturn, sourceBackRun: search.sourceBackRun };
  return <div className="mb-3">
    <Link className="small-link" to="/app" search={origin}>Back to answer</Link>
    <p className="data-note">{search.sourceScope === "all" ? "All eligible answers in this workspace and period." :
      <>{[group, engine && engines[engine], date && `${date} UTC`].filter(Boolean).join(" · ")}
        {" · "}<Link to="/app" search={wider}>Explore across all answers</Link></>}</p>
  </div>;
}
