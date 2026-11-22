import { z } from "zod";
import { HttpError } from "./types";
import { now, one, required, type Env } from "./types";
import { DAY_MS, validDay } from "../lib/analytics-filters";
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
  const { limits } = await organizationPlan(env, org);
  if (limits.searchable_history_days !== undefined) {
    where.conditions.push("runs.created_at>=?");
    where.bindings.push(now() - limits.searchable_history_days * 86400000);
  }
  return where;
}

export const scopeFilters = z.object({
  set: setId.optional(),
  tags: promptTags.optional(),
  location: z.string().trim().min(1).max(200).optional(),
  from: z.string().refine(validDay).optional(),
  to: z.string().refine(validDay).optional(),
  tracked_brand: setId.optional(),
  engine: z.enum(["chatgpt", "gemini", "google"]).optional(),
});
export const runHistoryFilters = scopeFilters.extend({
  workspace: setId.optional(),
  metric: z.enum(["eligible", "coverage", "brand", "mention", "citation"]).optional(),
  prompt_id: z.string().min(1).max(100).optional(),
  q: z.string().trim().max(200).optional(),
  outcome: z.enum(["pending", "failed", "uncertain", "organic", "no_answer", "eligible"]).optional(),
  status: z.enum(["queued", "submitting", "submitted", "succeeded", "failed", "uncertain"]).optional(),
  brand_id: z.string().min(1).max(100).optional(),
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
  if (filters.from && filters.to && filters.from > filters.to)
    throw new HttpError(400, "The start date must be on or before the end date");
  if (!!filters.research_type !== !!filters.research_value) throw new HttpError(400, "Choose a research item");
  if (filters.metric && ["brand", "mention", "citation"].includes(filters.metric) && !filters.tracked_brand)
    throw new HttpError(400, "Choose a tracked brand");
  return filters;
}

export const eligibleAnswer = "runs.status='succeeded' AND runs.has_answer=1";
export const outcomePredicates = {
  pending: "runs.status IN ('queued','submitting','submitted')",
  failed: "runs.status='failed'",
  uncertain: "runs.status='uncertain'",
  organic: "runs.status='succeeded' AND runs.has_answer=0 AND json_array_length(runs.organic_results)>0",
  no_answer: "runs.status='succeeded' AND runs.has_answer=0",
  eligible: eligibleAnswer,
};
export const runConfig = "CASE WHEN json_valid(runs.config) THEN runs.config ELSE '{}' END";
export const brandSnapshot = `json_each(${runConfig}, '$.brands')`;
export const runMentions = "json_each(CASE WHEN json_valid(runs.mentions) THEN runs.mentions ELSE '[]' END)";
export const brandSnapshotId = "CASE WHEN snapshot.type='object' THEN json_extract(snapshot.value,'$.id') END";
export function brandOutcome(brand: string, field: "mentioned" | "cited") {
  return `EXISTS (SELECT 1 FROM ${runMentions} AS mention WHERE CASE WHEN mention.type='object' THEN
    json_extract(mention.value,'$.brand_id')=${brand} AND json_extract(mention.value,'$.${field}')=1 END)`;
}

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
  if (filters.set || filters.tags?.length || filters.metric === "coverage") {
    const selected = currentPromptWhere(filters);
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
  if (filters.metric && ["brand", "mention", "citation"].includes(filters.metric)) {
    conditions.push(`EXISTS (SELECT 1 FROM ${brandSnapshot} AS snapshot WHERE ${brandSnapshotId}=?)`);
    bindings.push(filters.tracked_brand);
    if (filters.metric === "mention" || filters.metric === "citation") {
      conditions.push(brandOutcome("?", filters.metric === "mention" ? "mentioned" : "cited"));
      bindings.push(filters.tracked_brand);
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
  if (filters.research_type) {
    conditions.push("status='succeeded' AND has_answer=1");
    if (filters.research_type === "query") {
      conditions.push(`EXISTS (
        SELECT 1 FROM json_each(CASE WHEN json_valid(grounding_queries) THEN grounding_queries ELSE '[]' END)
        WHERE type='text' AND value=?
      )`);
    } else {
      const field = filters.research_type === "domain" ? "$.domain" : "$.url";
      conditions.push(`EXISTS (
        SELECT 1 FROM json_each(CASE WHEN json_valid(citations) THEN citations ELSE '[]' END) AS source
        WHERE CASE WHEN source.type='object' THEN json_extract(source.value,'${field}') END=?
      )`);
    }
    bindings.push(filters.research_value);
  }
  return { conditions, bindings };
}
