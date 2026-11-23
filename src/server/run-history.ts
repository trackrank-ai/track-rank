import { citationPageKey } from "../lib/citation-page";
import { citationPageSql } from "./citation-page";
import { questionTypeMatch } from "./prompt-questions";
import { questionTypes } from "../lib/question-type";
import { z } from "zod";
import { HttpError } from "./types";
import { now, one, required, type Env } from "./types";
import { answerMetrics, DAY_MS, overlapValues, validDay } from "../lib/analytics-filters";
import { promptTags } from "./prompt-tags";
import { promptSetPredicate, requirePromptSet, setId } from "./prompt-sets";
import { organizationPlan } from "./plans";

// Search visibility only: retain evidence, direct run links and admission ledgers.
export async function searchableHistoryWhere(env: Env, org: string, params: URLSearchParams) {
  const filters = parseHistoryFilters(params);
  if (filters.set) await requirePromptSet(env, org, filters.set, filters.workspace);
  else if (filters.workspace) required(await one(env,
    "SELECT id FROM workspaces WHERE org_id=? AND id=?", org, filters.workspace));
  const where = historyWhere(org, filters);
  if (filters.question_id) {
    const question = required(await one<{ workspace_id: string }>(env,
      "SELECT workspace_id FROM prompt_questions WHERE org_id=? AND id=?" +
        (filters.workspace ? " AND workspace_id=?" : ""),
      org, filters.question_id, ...(filters.workspace ? [filters.workspace] : [])));
    where.conditions.push("runs.workspace_id=?");
    where.bindings.push(question.workspace_id);
  }
  let recordedQuestion;
  if (filters.report_evidence_run) {
    const question = required(await one<{ workspace_id: string; prompt_text: string; engine: string | null }>(env,
      `SELECT workspace_id, prompt_text, json_extract(${runConfig},'$.engine') AS engine FROM runs WHERE org_id=? AND id=?` +
        (filters.workspace ? " AND workspace_id=?" : ""),
      org, filters.report_evidence_run, ...(filters.workspace ? [filters.workspace] : [])));
    recordedQuestion = question;
    where.conditions.push("runs.workspace_id=?", "runs.prompt_text=?");
    where.bindings.push(question.workspace_id, question.prompt_text);
    if (!filters.report_question_all_engines) {
      where.conditions.push(`json_extract(${runConfig},'$.engine') IS ?`);
      where.bindings.push(question.engine);
    }
  }
  const { limits } = await organizationPlan(env, org);
  const searchableSince = limits.searchable_history_days === undefined ? null : now() - limits.searchable_history_days * DAY_MS;
  if (searchableSince !== null) {
    where.conditions.push("runs.created_at>=?");
    where.bindings.push(searchableSince);
  }
  if (filters.match_from && filters.match_to) {
    const { workspace, set, tags, location, engine, tracked_brand, compare_brand } = filters;
    const reference = historyWhere(org, {
      workspace, set, tags, location, engine, tracked_brand, compare_brand,
      metric: tracked_brand ? "brand" : "eligible", from: filters.match_from, to: filters.match_to,
    });
    if (searchableSince !== null) {
      reference.conditions.push("runs.created_at>=?");
      reference.bindings.push(searchableSince);
    }
    const cell = "runs.workspace_id,runs.prompt_text,coalesce(json_extract(" + runConfig + ",'$.engine'),'')";
    where.conditions.push(`(${cell}) IN (SELECT ${cell} FROM runs WHERE ${reference.conditions.join(" AND ")})`);
    where.bindings.push(...reference.bindings);
  }
  return { ...where, searchableSince, recordedQuestion };
}

export async function historyReportCounts(env: Env, org: string, params: URLSearchParams,
  where: { conditions: string[]; bindings: unknown[] }, firstPage: boolean) {
  const include = params.get("include_report_counts");
  if (include === null) return;
  const metric = params.get("metric");
  if (include !== "true" || !metric) throw new HttpError(400, "Report counts require an answer metric and include_report_counts=true");
  if (!firstPage) return;
  const hasBrand = metric !== "eligible" && metric !== "coverage";
  const cohortParams = new URLSearchParams(params);
  if (hasBrand) cohortParams.set("metric", "brand");
  const cohort = cohortParams.get("metric") === metric ? where : await searchableHistoryWhere(env, org, cohortParams);
  const columns = ["COUNT(*) AS eligible"];
  const ids: string[] = [];
  if (hasBrand) {
    for (const [key, prefix] of [["tracked_brand", ""], ["compare_brand", "compare_"]]) {
      const brand = params.get(key);
      if (!brand) continue;
      columns.push(`COUNT(*) FILTER (WHERE ${brandOutcome("?", "mentioned")}) AS ${prefix}mentions`,
        `COUNT(*) FILTER (WHERE ${brandOutcome("?", "cited")}) AS ${prefix}citations`);
      ids.push(brand, brand);
    }
  }
  return one<Record<string, number>>(env, "SELECT " + columns.join(", ") + " FROM runs WHERE " + cohort.conditions.join(" AND "), ...ids, ...cohort.bindings);
}

export const scopeFilters = z.object({
  set: setId.optional(),
  tags: promptTags.optional(),
  location: z.string().trim().min(1).max(200).optional(),
  from: z.string().refine(validDay).optional(),
  to: z.string().refine(validDay).optional(),
  match_from: z.string().refine(validDay).optional(),
  match_to: z.string().refine(validDay).optional(),
  tracked_brand: setId.optional(),
  engine: z.enum(["chatgpt", "gemini", "google"]).optional(),
});
export const runHistoryFilters = scopeFilters.extend({
  workspace: setId.optional(),
  compare_brand: setId.optional(),
  overlap: z.enum(overlapValues).optional(),
  metric: z.enum(answerMetrics).optional(),
  question_id: setId.optional(),
  question_type: z.enum(questionTypes).optional(),
  report_evidence_run: setId.optional(),
  prompt_q: z.string().trim().max(200).optional(),
  report_question_all_engines: z.enum(["true"]).optional(),
  prompt_schedule: z.enum(["active", "inactive"]).optional(),
  prompt_brand: setId.optional(),
  prompt_id: z.string().min(1).max(100).optional(),
  q: z.string().trim().max(200).optional(),
  outcome: z.enum(["pending", "failed", "uncertain", "organic", "no_answer", "no_evidence", "eligible"]).optional(),
  status: z.enum(["queued", "submitting", "submitted", "succeeded", "failed", "uncertain"]).optional(),
  brand_id: z.string().min(1).max(100).optional(),
  within_source_type: z.enum(["domain", "page", "query"]).optional(),
  within_source_value: z.string().trim().min(1).max(4096).optional(),
  research_type: z.enum(["domain", "page", "query"]).optional(),
  research_value: z.string().trim().min(1).max(4096).optional(),
});

export function parseHistoryFilters(params: URLSearchParams) {
  const input: Record<string, unknown> = Object.fromEntries(params);
  const tags = params.get("tags");
  if (tags !== null) input.tags = tags.length <= 1020 ? tags.split(",") : null;
  const parsed = runHistoryFilters.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Invalid run history filters");
  const filters = parsed.data;
  if (!!filters.match_from !== !!filters.match_to || (filters.match_from && filters.match_to && filters.match_from > filters.match_to))
    throw new HttpError(400, "Choose a valid date range for the matched question and engine cohort");
  if (filters.from && filters.to && filters.from > filters.to)
    throw new HttpError(400, "The start date must be on or before the end date");
  if (filters.report_question_all_engines && !filters.report_evidence_run) throw new HttpError(400, "Choose a recorded question");
  if (!!filters.research_type !== !!filters.research_value || !!filters.within_source_type !== !!filters.within_source_value) throw new HttpError(400, "Choose a research item");
  if ((filters.prompt_schedule || filters.prompt_brand) && !filters.question_id && filters.prompt_q === undefined)
    throw new HttpError(400, "Choose a question or search the prompt library before filtering its variants");
  if (filters.metric && filters.metric !== "eligible" && filters.metric !== "coverage" && !filters.tracked_brand)
    throw new HttpError(400, "Choose a tracked brand");
  if (filters.compare_brand && (!filters.tracked_brand || filters.compare_brand === filters.tracked_brand))
    throw new HttpError(400, "Choose two distinct tracked brands");
  if (filters.overlap && !filters.compare_brand) throw new HttpError(400, "Choose two brands for the overlap cohort");
  if (filters.metric?.startsWith("compare_") && !filters.compare_brand)
    throw new HttpError(400, "Choose a comparison brand");
  return filters;
}

export const eligibleAnswer = "runs.status='succeeded' AND runs.has_answer=1";
const missingAnswer = "runs.status='succeeded' AND runs.has_answer=0";
const hasOrganic = "coalesce(json_array_length(runs.organic_results),0)>0";
export const outcomePredicates = {
  pending: "runs.status IN ('queued','submitting','submitted')",
  failed: "runs.status='failed'",
  uncertain: "runs.status='uncertain'",
  organic: `${missingAnswer} AND ${hasOrganic}`,
  no_answer: missingAnswer,
  no_evidence: `${missingAnswer} AND NOT (${hasOrganic})`,
  eligible: eligibleAnswer,
};
export const runConfig = "CASE WHEN json_valid(runs.config) THEN runs.config ELSE '{}' END";
export const brandSnapshot = `json_each(${runConfig}, '$.brands')`;
export const runMentions = "json_each(CASE WHEN json_valid(runs.mentions) THEN runs.mentions ELSE '[]' END)";
export const brandSnapshotId = "CASE WHEN snapshot.type='object' THEN json_extract(snapshot.value,'$.id') END";
export const brandTracked = `EXISTS (SELECT 1 FROM ${brandSnapshot} AS snapshot WHERE ${brandSnapshotId}=?)`;
export function brandOutcome(brand: string, field: "mentioned" | "cited") {
  return `EXISTS (SELECT 1 FROM ${runMentions} AS mention WHERE CASE WHEN mention.type='object' THEN
    json_extract(mention.value,'$.brand_id')=${brand} AND json_extract(mention.value,'$.${field}')=1 END)`;
}

export const activePromptSchedule =
  "EXISTS(SELECT 1 FROM schedules s WHERE s.org_id=p.org_id AND s.prompt_id=p.id AND s.enabled=1)";
export const associatedPromptBrand = `(p.brand_id=? OR (p.brand_id IS NULL AND EXISTS(
  SELECT 1 FROM workspaces w WHERE w.org_id=p.org_id AND w.id=p.workspace_id AND w.brand_id=?
)))`;

export function currentPromptWhere(filters: z.output<typeof runHistoryFilters>) {
  const conditions = ["p.archived_at IS NULL"];
  const bindings: unknown[] = [];
  if (filters.set) {
    conditions.push(promptSetPredicate("p"));
    bindings.push(filters.set);
  }
  if (filters.tags?.length) {
    conditions.push("NOT EXISTS (SELECT value FROM json_each(?) EXCEPT SELECT value FROM json_each(p.tags))");
    bindings.push(JSON.stringify(filters.tags));
  }
  return { conditions, bindings };
}

function historyWhere(org: string, filters: z.output<typeof runHistoryFilters>) {
  const conditions = ["runs.org_id=?"];
  const bindings: unknown[] = [org];
  if (filters.workspace) {
    conditions.push("runs.workspace_id=?");
    bindings.push(filters.workspace);
  }
  if (filters.question_type || filters.question_id || filters.prompt_q !== undefined || filters.set || filters.tags?.length || filters.metric === "coverage") {
    const selected = currentPromptWhere(filters);
    if (filters.question_type) { selected.conditions.push(questionTypeMatch); selected.bindings.push(filters.question_type); }
    if (filters.question_id) {
      selected.conditions.push("p.question_id=?");
      selected.bindings.push(filters.question_id);
    }
    if (filters.prompt_q) {
      selected.conditions.push("instr(lower(p.text),lower(?))>0");
      selected.bindings.push(filters.prompt_q);
    }
    if (filters.prompt_schedule) {
      selected.conditions.push(filters.prompt_schedule === "active" ? activePromptSchedule : "NOT " + activePromptSchedule);
    }
    if (filters.prompt_brand) {
      selected.conditions.push(associatedPromptBrand);
      selected.bindings.push(filters.prompt_brand, filters.prompt_brand);
    }
    conditions.push(`EXISTS (SELECT 1 FROM prompts p WHERE p.org_id=runs.org_id AND p.id=runs.prompt_id
      AND p.workspace_id=runs.workspace_id AND ${selected.conditions.join(" AND ")})`);
    bindings.push(...selected.bindings);
  }
  if (filters.engine) {
    conditions.push(`json_extract(${runConfig},'$.engine')=?`);
    bindings.push(filters.engine);
  }
  if (filters.location) {
    conditions.push(`json_extract(${runConfig},'$.location_name') COLLATE NOCASE=?`);
    bindings.push(filters.location);
  }
  if (filters.from) {
    conditions.push("runs.created_at>=?");
    bindings.push(Date.parse(filters.from));
  }
  if (filters.to) {
    conditions.push("runs.created_at<?");
    bindings.push(Date.parse(filters.to) + DAY_MS);
  }
  if (filters.metric) conditions.push(eligibleAnswer);
  if (filters.metric && filters.metric !== "eligible" && filters.metric !== "coverage") {
    for (const brand of [filters.tracked_brand, filters.compare_brand]) {
      if (!brand) continue;
      conditions.push(brandTracked);
      bindings.push(brand);
    }
    if (filters.metric !== "brand") {
      conditions.push(brandOutcome("?", filters.metric.endsWith("mention") ? "mentioned" : "cited"));
      bindings.push(filters.metric.startsWith("compare_") ? filters.compare_brand : filters.tracked_brand);
    }
  }
  if (filters.overlap) {
    conditions.push(eligibleAnswer, brandTracked, brandTracked);
    bindings.push(filters.tracked_brand, filters.compare_brand);
    if (filters.overlap !== "all") {
      const client = filters.overlap === "client_only" || filters.overlap === "both";
      const competitor = filters.overlap === "competitor_only" || filters.overlap === "both";
      conditions.push((client ? "" : "NOT ") + brandOutcome("?", "mentioned"),
        (competitor ? "" : "NOT ") + brandOutcome("?", "mentioned"));
      bindings.push(filters.tracked_brand, filters.compare_brand);
    }
  }
  if (filters.prompt_id) {
    conditions.push("prompt_id=?");
    bindings.push(filters.prompt_id);
  }
  if (filters.outcome) conditions.push(outcomePredicates[filters.outcome]);
  if (filters.status) {
    conditions.push("status=?");
    bindings.push(filters.status);
  }
  if (filters.q) {
    conditions.push("(instr(lower(prompt_text),lower(?))>0 OR instr(lower(answer_text),lower(?))>0)");
    bindings.push(filters.q, filters.q);
  }
  if (filters.brand_id) {
    conditions.push(`status='succeeded' AND has_answer=1 AND EXISTS (
      SELECT 1 FROM json_each(CASE WHEN json_valid(mentions) THEN mentions ELSE '[]' END) AS mention
      WHERE CASE WHEN mention.type='object' THEN json_extract(mention.value,'$.brand_id') END=?
        AND CASE WHEN mention.type='object' THEN (
          json_extract(mention.value,'$.mentioned')=1 OR json_extract(mention.value,'$.cited')=1
        ) END
    )`);
    bindings.push(filters.brand_id);
  }
  for (const [type, value] of [[filters.research_type, filters.research_value], [filters.within_source_type, filters.within_source_value]] as const) {
    if (!type || !value) continue;
    conditions.push("status='succeeded' AND has_answer=1");
    if (type === "query") {
      conditions.push(`EXISTS (
        SELECT 1 FROM json_each(CASE WHEN json_valid(grounding_queries) THEN grounding_queries ELSE '[]' END)
        WHERE type='text' AND value=?
      )`);
    } else {
      const field = type === "domain" ? "json_extract(source.value,'$.domain')" : citationPageSql("json_extract(source.value,'$.url')");
      conditions.push(`EXISTS (
        SELECT 1 FROM json_each(CASE WHEN json_valid(citations) THEN citations ELSE '[]' END) AS source
        WHERE CASE WHEN source.type='object' THEN ${field} END=?
      )`);
    }
    bindings.push(type === "page" ? citationPageKey(value) : value);
  }
  return { conditions, bindings };
}
