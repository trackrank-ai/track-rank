import { z } from "zod";
import { HttpError } from "./types";
import { now, type Env } from "./types";
import { organizationPlan } from "./plans";

// Search visibility only: retain evidence, direct run links and admission ledgers.
export async function searchableHistoryWhere(env: Env, org: string, params: URLSearchParams) {
  const where = historyWhere(org, params);
  const { limits } = await organizationPlan(env, org);
  if (limits.searchable_history_days !== undefined) {
    where.conditions.push("created_at>=?");
    where.bindings.push(now() - limits.searchable_history_days * 86400000);
  }
  return where;
}

export const runHistoryFilters = z.object({
  engine: z.enum(["chatgpt", "gemini", "google"]).optional(),
  prompt_id: z.string().min(1).max(100).optional(),
  q: z.string().trim().max(200).optional(),
  status: z.enum(["queued", "submitting", "submitted", "succeeded", "failed", "uncertain"]).optional(),
  brand_id: z.string().min(1).max(100).optional(),
  research_type: z.enum(["domain", "page", "query"]).optional(),
  research_value: z.string().trim().min(1).max(4096).optional(),
});

export function historyWhere(org: string, params: URLSearchParams) {
  const parsed = runHistoryFilters.safeParse(Object.fromEntries(params));
  if (!parsed.success) throw new HttpError(400, "Invalid run history filters");
  const filters = parsed.data;
  if (!!filters.research_type !== !!filters.research_value) throw new HttpError(400, "Choose a research item");
  const conditions = ["org_id=?"];
  const bindings: unknown[] = [org];
  const workspace = params.get("workspace");
  if (workspace) {
    conditions.push("workspace_id=?");
    bindings.push(workspace);
  }
  if (filters.engine) {
    conditions.push("json_extract(CASE WHEN json_valid(config) THEN config ELSE '{}' END,'$.engine')=?");
    bindings.push(filters.engine);
  }
  if (filters.prompt_id) {
    conditions.push("prompt_id=?");
    bindings.push(filters.prompt_id);
  }
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
