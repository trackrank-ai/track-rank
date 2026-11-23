import { analyticsQuery, analyticsScope } from "./analytics-filters";
import { parseAppSearch, type AppSearch } from "./app-location";

export function sourceReturnSearch(search: AppSearch): AppSearch | undefined {
  if (!search.sourceReturn || !search.sourceBackRun) return;
  const back = parseAppSearch(Object.fromEntries(new URLSearchParams(search.sourceReturn)));
  if (back.tab === "runs" && back.run === search.sourceBackRun && back.org === search.org && back.workspace === search.workspace) return back;
}

// The page report, matching-answer list and CSV must use the same source cohort.
export function sourceReportQuery(search: AppSearch) {
  const query = analyticsQuery(analyticsScope(search), search.workspace);
  const origin = sourceReturnSearch(search);
  if (!origin || search.sourceScope === "all") return query;
  if (origin.sourceReturn && !origin.sourceScope) {
    for (const [key, value] of sourceReportQuery(origin)) query.set(key, value);
  }
  const add = (name: string, value?: string) => { if (value) query.set(name, value); };
  if (origin.question || origin.promptView === "answers") {
    add("question_id", origin.question);
    if (!origin.question) query.set("prompt_q", origin.q ?? "");
    add("engine", origin.questionEngine === "all" ? undefined : origin.questionEngine ?? origin.promptEngine);
    add("tags", origin.tag);
    add("tracked_brand", origin.brand);
    add("metric", origin.brand ? origin.questionMetric ?? "brand" : "eligible");
    add("question_type", origin.questionType);
    add("prompt_brand", origin.promptBrand);
    add("prompt_schedule", origin.promptSchedule);
  } else {
    add("metric", origin.metric);
    add("q", origin.q);
    add("status", origin.status);
    add("outcome", origin.outcome);
    add("brand_id", origin.brand);
    add("prompt_id", origin.runPrompt);
    add("report_evidence_run", origin.reportQuestion);
    if (origin.researchType && origin.researchValue) {
      add("within_source_type", origin.researchType);
      add("within_source_value", origin.researchValue);
      if (origin.sourceQuestion) {
        add("report_evidence_run", origin.sourceQuestion);
        add("report_question_all_engines", "true");
      }
    }
    if (origin.evidenceDay) {
      query.set("from", origin.evidenceDay);
      query.set("to", origin.evidenceDay);
    }
  }
  return query;
}
