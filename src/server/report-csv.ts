import { analytics } from "./analytics";
import { parseHistoryFilters } from "./run-history";
import type { Env, Row } from "./types";

export function csvDownload(filename: string, headers: string[], rows: Row[]) {
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return new Response([headers.join(","), ...rows.map(row => headers.map(h => cell(row[h])).join(","))].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function exportOverview(env: Env, org: string, params: URLSearchParams) {
  const report = await analytics(env, org, params);
  const filters = parseHistoryFilters(params);
  const context = {
    organization: org, workspace: filters.workspace, engine: filters.engine, location: filters.location, set: filters.set,
    tags: filters.tags?.join(","), tracked_brand: filters.tracked_brand, compare_brand: filters.compare_brand,
    match_from: filters.match_from, match_to: filters.match_to,
  };
  const rows: Row[] = [];
  const range = { from: report.from, to: report.to };
  const record = (metric: string, numerator: number, denominator: number, definition: string, extra: Row = {}) =>
    rows.push({ ...context, ...range, metric, numerator, denominator,
      fraction: denominator ? numerator / denominator : null, definition, ...extra });
  record("question_coverage", report.covered_prompts, report.selected_prompts, "Selected questions with an eligible answer / selected questions");
  for (const cell of report.engine_brands) {
    const labels = { engine: cell.engine, brand: cell.id, brand_name: cell.name };
    record("mention_rate", cell.mentions, cell.samples, "Answers mentioning brand / eligible tracked answers", labels);
    record("citation_rate", cell.citations, cell.samples, "Answers citing brand / eligible tracked answers", labels);
  }
  for (const brand of report.individual_coverage) {
    rows.push({ ...context, ...range, metric: "individual_eligible_answers", brand: brand.id,
      brand_name: report.brands.find(row => row.id === brand.id)?.name, numerator: brand.samples, common_cohort_answers: 0,
      definition: "Eligible answers tracking this individual brand when the pair has no shared answers" });
  }
  if (report.mention_share) {
    for (const brand of report.mention_share.brands)
      record("share_of_mentions", brand.mentions, report.mention_share.credited_mentions,
        "Answers mentioning brand / total once-per-answer credits for the two tracked brands",
        { brand: brand.id, common_cohort_answers: report.mention_share.samples });
  }
  const previous = report.previous_period;
  for (const [brand, mentions, citations] of [
    [filters.tracked_brand, previous.mentions, previous.citations],
    [filters.compare_brand, previous.compare_mentions, previous.compare_citations],
  ] as const) {
    if (!brand) continue;
    const period = { from: previous.from, to: previous.to, complete_window: previous.complete, brand,
      match_from: filters.match_from ? report.from : undefined, match_to: filters.match_to ? report.to : undefined };
    record("previous_mention_rate", mentions, previous.samples, "Answers mentioning brand / eligible tracked answers", period);
    record("previous_citation_rate", citations, previous.samples, "Answers citing brand / eligible tracked answers", period);
  }
  return csvDownload("trackrank-overview.csv", [
    ...Object.keys(context), "from", "to", "metric", "brand", "brand_name", "numerator", "denominator", "fraction",
    "common_cohort_answers", "complete_window", "definition",
  ], rows);
}
