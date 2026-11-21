import { z } from "zod";
import { all, HttpError, type Env, type Row } from "./types";

const libraryFilters = z.object({
  workspace: z.string().min(1).max(100).optional(),
  q: z.string().trim().max(200).default(""),
  engine: z.enum(["chatgpt", "gemini", "google"]).optional(),
  schedule: z.enum(["active", "inactive"]).optional(),
  brand: z.string().min(1).max(100).optional(),
  before: z.coerce.number().int().nonnegative().optional(),
  before_id: z.string().min(1).max(100).optional(),
}).refine(filters => (filters.before === undefined) === (filters.before_id === undefined));

export async function listSavedPrompts(env: Env, org: string, params: URLSearchParams) {
  const parsed = libraryFilters.safeParse(Object.fromEntries(params));
  if (!parsed.success) throw new HttpError(400, "Invalid saved prompt filters or cursor");
  const filters = parsed.data;
  const conditions = ["p.org_id=?"];
  const values: unknown[] = [org];
  if (filters.workspace) {
    conditions.push("p.workspace_id=?");
    values.push(filters.workspace);
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
  if (filters.before !== undefined) {
    conditions.push("(p.created_at,p.id)<(?,?)");
    values.push(filters.before, filters.before_id);
  }
  const pageSize = 100;
  const rows = await all<Row>(env,
    `SELECT p.*, (${activeSchedule}) AS actively_scheduled FROM prompts p
     WHERE ${conditions.join(" AND ")} ORDER BY p.created_at DESC,p.id DESC LIMIT ?`,
    ...values, pageSize + 1,
  );
  const last = rows.length > pageSize ? rows[pageSize - 1] : null;
  return {
    prompts: rows.slice(0, pageSize),
    next_cursor: last ? { before: last.created_at, before_id: last.id } : null,
  };
}
