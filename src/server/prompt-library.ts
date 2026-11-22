import { decodePrompt, promptTag } from "./prompt-tags";
import { z } from "zod";
import { all, one, HttpError, type Env, type Row } from "./types";

export const listPageLimit = z.number().int().min(1);
const libraryFilters = z.object({
  workspace: z.string().min(1).max(100).optional(),
  q: z.string().trim().max(200).default(""),
  engine: z.enum(["chatgpt", "gemini", "google"]).optional(),
  schedule: z.enum(["active", "inactive"]).optional(),
  brand: z.string().min(1).max(100).optional(),
  tag: promptTag.optional(),
  limit: z.coerce.number().pipe(listPageLimit.max(100)).optional(),
  selection: z.literal("1").optional(),
  before: z.coerce.number().int().nonnegative().optional(),
  before_id: z.string().min(1).max(100).optional(),
}).refine(filters => (filters.before === undefined) === (filters.before_id === undefined));

export async function listSavedPrompts(env: Env, org: string, params: URLSearchParams) {
  const parsed = libraryFilters.safeParse(Object.fromEntries(params));
  if (!parsed.success) throw new HttpError(400, "Invalid saved prompt filters or cursor");
  const filters = parsed.data;
  const conditions = ["p.org_id=?", "p.archived_at IS NULL"];
  const values: unknown[] = [org];
  if (filters.workspace) {
    conditions.push("p.workspace_id=?");
    values.push(filters.workspace);
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
  const activeSchedule = "p.enabled=1 AND EXISTS(SELECT 1 FROM schedules s WHERE s.org_id=p.org_id AND s.prompt_id=p.id AND s.enabled=1)";
  if (filters.schedule === "active") conditions.push(activeSchedule);
  if (filters.schedule === "inactive") conditions.push("NOT (" + activeSchedule + ")");
  const total = filters.before === undefined && !filters.selection
    ? one<{ total: number }>(env, `SELECT count(*) AS total FROM prompts p WHERE ${conditions.join(" AND ")}`, ...values)
    : null;
  if (filters.before !== undefined) {
    conditions.push("(p.created_at,p.id)<(?,?)");
    values.push(filters.before, filters.before_id);
  }
  const pageSize = filters.selection ? 1000 : filters.limit ?? 100;
  const columns = filters.selection
    ? "p.id, p.workspace_id, p.created_at"
    : `p.*, (${activeSchedule}) AS actively_scheduled`;
  const [rows, tags, count] = await Promise.all([
    all<Row>(env,
      `SELECT ${columns} FROM prompts p
       WHERE ${conditions.join(" AND ")} ORDER BY p.created_at DESC,p.id DESC LIMIT ?`,
      ...values, pageSize + 1,
    ),
    filters.selection ? [] : all<{ tag: string }>(env,
      `SELECT DISTINCT t.value AS tag FROM prompts p, json_each(p.tags) t
       WHERE ${tagScope} ORDER BY tag`, ...tagValues,
    ),
    total,
  ]);
  const last = rows.length > pageSize ? rows[pageSize - 1] : null;
  return {
    prompts: filters.selection
      ? rows.slice(0, pageSize).map(({ id, workspace_id }) => ({ id, workspace_id }))
      : rows.slice(0, pageSize).map(decodePrompt),
    ...(count ? { total: count.total } : {}),
    tags: tags.map(row => row.tag),
    next_cursor: last ? { before: last.created_at, before_id: last.id } : null,
  };
}
