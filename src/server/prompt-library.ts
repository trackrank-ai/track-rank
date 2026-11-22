import { brandOutcome, brandSnapshot, brandSnapshotId, eligibleAnswer } from "./run-history";
import { organizationPlan } from "./plans";
import { defaultPeriod, DAY_MS, validDay } from "../lib/analytics-filters";
import { promptSetPredicate, requirePromptSet, setId } from "./prompt-sets";
import { decodePrompt, promptTag } from "./prompt-tags";
import { z } from "zod";
import { all, one, now, HttpError, type Env, type Row } from "./types";

export const listPageLimit = z.number().int().min(1);
const libraryFilters = z.object({
  workspace: z.string().min(1).max(100).optional(),
  q: z.string().trim().max(200).default(""),
  engine: z.enum(["chatgpt", "gemini", "google"]).optional(),
  schedule: z.enum(["active", "inactive"]).optional(),
  tracked_brand: setId.optional(),
  from: z.string().refine(validDay).optional(),
  to: z.string().refine(validDay).optional(),
  brand: z.string().min(1).max(100).optional(),
  tag: promptTag.optional(),
  set: setId.optional(),
  limit: z.coerce.number().pipe(listPageLimit.max(100)).optional(),
  selection: z.literal("1").optional(),
  before: z.coerce.number().int().nonnegative().optional(),
  before_id: z.string().min(1).max(100).optional(),
}).refine(filters => (filters.before === undefined) === (filters.before_id === undefined));

export async function listSavedPrompts(env: Env, org: string, params: URLSearchParams) {
  const parsed = libraryFilters.safeParse(Object.fromEntries(params));
  if (!parsed.success) throw new HttpError(400, "Invalid saved prompt filters or cursor");
  const filters = parsed.data;
  if (filters.from && filters.to && filters.from > filters.to) throw new HttpError(400, "Choose a valid date range");
  const conditions = ["p.org_id=?", "p.archived_at IS NULL"];
  const values: unknown[] = [org];
  if (filters.workspace) {
    conditions.push("p.workspace_id=?");
    values.push(filters.workspace);
  }
  if (filters.set) {
    await requirePromptSet(env, org, filters.set, filters.workspace);
    conditions.push(promptSetPredicate("p"));
    values.push(filters.set);
  }
  const tagScope = conditions.join(" AND ");
  const tagValues = [...values];
  if (filters.tag) {
    conditions.push("EXISTS(SELECT 1 FROM json_each(p.tags) WHERE value=?)");
    values.push(filters.tag);
  }
  if (filters.q) {
    conditions.push("instr(lower(p.text), lower(?))>0");
    values.push(filters.q);
  }
  if (filters.engine) {
    conditions.push("p.engine=?");
    values.push(filters.engine);
  }
  if (filters.brand) {
    conditions.push(`(p.brand_id=? OR (p.brand_id IS NULL AND EXISTS(
      SELECT 1 FROM workspaces w WHERE w.org_id=p.org_id AND w.id=p.workspace_id AND w.brand_id=?
    )))`);
    values.push(filters.brand, filters.brand);
  }
  const activeSchedule = "EXISTS(SELECT 1 FROM schedules s WHERE s.org_id=p.org_id AND s.prompt_id=p.id AND s.enabled=1)";
  if (filters.schedule === "active") conditions.push(activeSchedule);
  if (filters.schedule === "inactive") conditions.push("NOT (" + activeSchedule + ")");
  const scope = conditions.join(" AND ");
  const total = filters.before === undefined && !filters.selection
    ? one<{ total: number }>(env,
      `SELECT count(*) AS total FROM (SELECT 1 FROM prompts p WHERE ${scope} GROUP BY question_id)`, ...values)
    : null;
  const cursor = filters.before === undefined ? "" : "AND (created_at,id)<(?,?)";
  const cursorValues = filters.before === undefined ? [] : [filters.before, filters.before_id];
  const pageSize = filters.selection ? 1000 : filters.limit ?? 100;
  const historyDays = filters.selection ? undefined : (await organizationPlan(env, org)).limits.searchable_history_days;
  const historyFloor = historyDays === undefined ? 0 : now() - historyDays * DAY_MS;
  const period = defaultPeriod(now());
  const start = Math.max(historyFloor, Date.parse(filters.from ?? period.from));
  const end = Date.parse(filters.to ?? period.to) + DAY_MS;
  const runScope = "runs.org_id=p.org_id AND runs.prompt_id=p.id AND runs.workspace_id=p.workspace_id";
  const columns = filters.selection
    ? "p.id, p.workspace_id, p.created_at"
    : `p.*, (${activeSchedule}) AS actively_scheduled,
       (SELECT json_object('id',id,'status',status,'has_answer',has_answer,'has_organic',json_array_length(organic_results)>0,'created_at',created_at)
        FROM runs WHERE ${runScope} AND created_at>=? ORDER BY created_at DESC,id DESC LIMIT 1) AS latest_collection,
       (SELECT id FROM runs WHERE ${runScope} AND ${eligibleAnswer} AND created_at>=?
         ORDER BY created_at DESC,id DESC LIMIT 1) AS latest_answer_id${filters.tracked_brand ? `,
       (SELECT json_object('samples',count(*),'mentions',coalesce(sum(${brandOutcome("?", "mentioned")}),0))
        FROM runs WHERE ${runScope} AND ${eligibleAnswer} AND created_at>=? AND created_at<?
        AND EXISTS (SELECT 1 FROM ${brandSnapshot} AS snapshot WHERE ${brandSnapshotId}=?)) AS brand_period` : ""}`;
  const historyParams = filters.selection ? [] : [historyFloor, historyFloor, ...(filters.tracked_brand
    ? [filters.tracked_brand, start, end, filters.tracked_brand] : [])];
  const [rows, tags, count] = await Promise.all([
    all<Row>(env, `WITH matching AS (
          SELECT p.*, row_number() OVER (PARTITION BY question_id ORDER BY created_at DESC,id DESC) AS variant_rank
          FROM prompts p WHERE ${scope}
        ), page AS (
          SELECT id,question_id,text,created_at FROM matching WHERE variant_rank=1 ${cursor}
          ORDER BY created_at DESC,id DESC LIMIT ?
        )
        SELECT ${columns}, page.question_id AS group_id, page.id AS cursor_id, page.created_at AS group_created_at, page.text AS group_text
        FROM page JOIN matching p ON p.question_id=page.question_id
        ORDER BY page.created_at DESC,page.id DESC,p.created_at DESC,p.id DESC`,
      ...values, ...cursorValues, pageSize + 1, ...historyParams),
    filters.selection ? [] : all<{ tag: string }>(env,
      `SELECT DISTINCT t.value AS tag FROM prompts p, json_each(p.tags) t
       WHERE ${tagScope} ORDER BY tag`, ...tagValues,
    ),
    total,
  ]);
  function variant(row: Row) {
    if (filters.selection) return { id: row.id, workspace_id: row.workspace_id };
    return {
      ...decodePrompt(row),
      latest_collection: row.latest_collection ? JSON.parse(String(row.latest_collection)) : null,
      brand_period: row.brand_period ? JSON.parse(String(row.brand_period)) : null,
    };
  }

  const groups = new Map<unknown, Row>();
  for (const { group_id, group_created_at, group_text, cursor_id, variant_rank, ...row } of rows) {
    let group = groups.get(group_id);
    if (!group) {
      group = { id: group_id, cursor_id, created_at: group_created_at, workspace_id: row.workspace_id, text: group_text, variants: [] };
      groups.set(group_id, group);
    }
    (group.variants as unknown[]).push(variant(row));
  }
  const entries = [...groups.values()];
  const last = entries.length > pageSize ? entries[pageSize - 1] : null;
  return {
    prompts: entries.slice(0, pageSize).map(({ cursor_id, ...group }) => group),
    ...(count ? { total: count.total } : {}),
    tags: tags.map(row => row.tag),
    next_cursor: last ? { before: last.created_at, before_id: last.cursor_id } : null,
  };
}
