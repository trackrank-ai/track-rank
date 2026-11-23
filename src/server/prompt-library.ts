import { activePromptSchedule, associatedPromptBrand, brandOutcome, brandTracked, eligibleAnswer, runConfig } from "./run-history";
import { organizationPlan } from "./plans";
import { defaultPeriod, DAY_MS, validDay } from "../lib/analytics-filters";
import { brandPromptSorts, promptLibrarySortKeys } from "../lib/prompt-library-sort";
import { promptSetPredicate, requirePromptSet, setId } from "./prompt-sets";
import { decodePrompt, promptTag } from "./prompt-tags";
import { z } from "zod";
import { all, one, now, HttpError, type Env, type Row } from "./types";

export const listPageLimit = z.number().int().min(1);
const libraryFilters = z.object({
  workspace: z.string().min(1).max(100).optional(),
  question_id: setId.optional(),
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
  sort: z.enum(promptLibrarySortKeys).default("newest"),
  before: z.coerce.number().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
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
  if (filters.question_id) {
    const question = await one(env, `SELECT id FROM prompt_questions WHERE org_id=? AND id=?${filters.workspace ? " AND workspace_id=?" : ""}`,
      org, filters.question_id, ...(filters.workspace ? [filters.workspace] : []));
    if (!question) throw new HttpError(404, "Question not found");
    conditions.push("p.question_id=?");
    values.push(filters.question_id);
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
    conditions.push(associatedPromptBrand);
    values.push(filters.brand, filters.brand);
  }
  if (filters.schedule === "active") conditions.push(activePromptSchedule);
  if (filters.schedule === "inactive") conditions.push("NOT (" + activePromptSchedule + ")");
  const scope = conditions.join(" AND ");
  const total = filters.before === undefined && !filters.selection
    ? one<{ total: number }>(env,
      `SELECT count(*) AS total FROM (SELECT 1 FROM prompts p WHERE ${scope} GROUP BY question_id)`, ...values)
    : null;
  if (!filters.selection && brandPromptSorts.includes(filters.sort) && !filters.tracked_brand)
    throw new HttpError(400, "Choose a tracked brand to sort by its outcomes");
  const sort = filters.selection ? "newest" : filters.sort;
  const sortKey = {
    newest: "matching.created_at",
    last_checked: "coalesce(last_checked_at,0)",
    never_checked: "CASE WHEN last_checked_at IS NULL THEN 1 ELSE 0 END",
    answers: "coalesce(eligible_answers,0)",
    mentions: "CASE WHEN eligible_answers>0 THEN 1 + mentions ELSE 0 END",
    citations: "CASE WHEN eligible_answers>0 THEN 1 + citations ELSE 0 END",
    // Place measured rates, including 100%, ahead of empty cohorts.
    lowest_mention_rate: "CASE WHEN eligible_answers>0 THEN 2 - (1.0 * mentions / eligible_answers) ELSE 0 END",
  }[sort];
  const cursor = filters.before === undefined ? "" : "WHERE (sort_key,id)<(?,?)";
  const cursorValues = filters.before === undefined ? [] : [filters.before, filters.before_id];
  const pageSize = filters.selection ? 1000 : filters.limit ?? 100;
  const historyDays = filters.selection ? undefined : (await organizationPlan(env, org)).limits.searchable_history_days;
  const time = now();
  const historyFloor = historyDays === undefined ? 0 : time - historyDays * DAY_MS;
  const period = defaultPeriod(time);
  const start = Math.max(historyFloor, Date.parse(filters.from ?? period.from));
  const end = Date.parse(filters.to ?? period.to) + DAY_MS;
  const runScope = "runs.org_id=p.org_id AND runs.prompt_id=p.id AND runs.workspace_id=p.workspace_id" +
    (filters.engine ? ` AND json_extract(${runConfig},'$.engine')=p.engine` : "");
  const evidence = filters.selection ? "" : `, evidence AS (
          SELECT runs.question_id,
            max(CASE WHEN runs.status IN ('succeeded','failed') THEN runs.updated_at END) AS last_checked_at,
            sum(CASE WHEN runs.status IN ('succeeded','failed') AND runs.created_at>=? AND runs.created_at<? THEN 1 ELSE 0 END) AS checks,
            sum(in_cohort) AS eligible_answers,
            sum(CASE WHEN in_cohort THEN mentioned ELSE 0 END) AS mentions,
            sum(CASE WHEN in_cohort THEN cited ELSE 0 END) AS citations
          FROM (
            SELECT runs.created_at, runs.updated_at, runs.status, p.question_id,
              CASE WHEN ${eligibleAnswer} AND runs.created_at>=? AND runs.created_at<?
                ${filters.tracked_brand ? `AND ${brandTracked}` : ""} THEN 1 ELSE 0 END AS in_cohort,
              ${filters.tracked_brand ? brandOutcome("?", "mentioned") : "0"} AS mentioned,
              ${filters.tracked_brand ? brandOutcome("?", "cited") : "0"} AS cited
            FROM matching p JOIN runs ON ${runScope} AND runs.created_at>=?
          ) AS runs
          GROUP BY runs.question_id
        )`;
  const evidenceParams = filters.selection ? [] : [start, end, start, end, ...(filters.tracked_brand
    ? [filters.tracked_brand, filters.tracked_brand, filters.tracked_brand] : []), historyFloor];
  const columns = filters.selection
    ? "p.id, p.workspace_id, p.created_at"
    : `p.*, (${activePromptSchedule}) AS actively_scheduled,
       (SELECT json_object('id',id,'status',status,'has_answer',has_answer,'has_organic',json_array_length(organic_results)>0,'created_at',created_at)
        FROM runs WHERE ${runScope} AND created_at>=? ORDER BY created_at DESC,id DESC LIMIT 1) AS latest_collection,
       (SELECT updated_at FROM runs WHERE ${runScope} AND status='succeeded' AND created_at>=?
         ORDER BY updated_at DESC,id DESC LIMIT 1) AS latest_completed_at,
       (SELECT id FROM runs WHERE ${runScope} AND ${eligibleAnswer} AND created_at>=?
         ORDER BY created_at DESC,id DESC LIMIT 1) AS latest_answer_id${filters.tracked_brand ? `,
       (SELECT json_object('samples',count(*),'mentions',coalesce(sum(${brandOutcome("?", "mentioned")}),0))
        FROM runs WHERE ${runScope} AND ${eligibleAnswer} AND created_at>=? AND created_at<?
        AND ${brandTracked}) AS brand_period` : ""}`;
  const historyParams = filters.selection ? [] : [historyFloor, historyFloor, historyFloor, ...(filters.tracked_brand
    ? [filters.tracked_brand, start, end, filters.tracked_brand] : [])];
  const groupMetrics = filters.selection ? "" : ", last_checked_at, checks, eligible_answers, mentions, citations";
  const pageMetrics = filters.selection ? "" : ", page.last_checked_at, page.checks, page.eligible_answers, page.mentions, page.citations";
  const [rows, tags, count] = await Promise.all([
    all<Row>(env, `WITH matching AS (
          SELECT p.*, row_number() OVER (PARTITION BY question_id ORDER BY created_at DESC,id DESC) AS variant_rank
          FROM prompts p WHERE ${scope}
        ) ${evidence}, ranked AS (
          SELECT matching.id,matching.question_id,matching.text,matching.created_at, ${sortKey} AS sort_key ${groupMetrics}
          FROM matching ${filters.selection ? "" : "LEFT JOIN evidence ON evidence.question_id=matching.question_id"} WHERE variant_rank=1
        ), page AS (
          SELECT * FROM ranked ${cursor} ORDER BY sort_key DESC,id DESC LIMIT ?
        )
        SELECT ${columns}, page.question_id AS group_id, page.id AS cursor_id, page.sort_key, page.created_at AS group_created_at, page.text AS group_text ${pageMetrics}
        FROM page JOIN matching p ON p.question_id=page.question_id
        ORDER BY page.sort_key DESC,page.id DESC,p.created_at DESC,p.id DESC`,
      ...values, ...evidenceParams, ...cursorValues, pageSize + 1, ...historyParams),
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
  for (const { group_id, group_created_at, group_text, cursor_id, sort_key, variant_rank, last_checked_at, checks, eligible_answers, mentions, citations, ...row } of rows) {
    let group = groups.get(group_id);
    if (!group) {
      group = { id: group_id, cursor_id, sort_key, created_at: group_created_at, workspace_id: row.workspace_id, text: group_text, variants: [] };
      if (!filters.selection) {
        group.last_checked_at = last_checked_at ?? null;
        group.period = { checks: checks ?? 0, eligible_answers: eligible_answers ?? 0, mentions: filters.tracked_brand ? mentions ?? 0 : null,
          citations: filters.tracked_brand ? citations ?? 0 : null };
      }
      groups.set(group_id, group);
    }
    (group.variants as unknown[]).push(variant(row));
  }
  const entries = [...groups.values()];
  const last = entries.length > pageSize ? entries[pageSize - 1] : null;
  return {
    prompts: entries.slice(0, pageSize).map(({ cursor_id, sort_key, ...group }) => group),
    ...(count ? { total: count.total } : {}),
    tags: tags.map(row => row.tag),
    next_cursor: last ? { before: last.sort_key, before_id: last.cursor_id } : null,
  };
}
