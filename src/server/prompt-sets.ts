import { z } from "zod";
import { body } from "./request-body";
import { all, exec, HttpError, json, one, required, uuid, type Env } from "./types";

export const setId = z.string().regex(/^[\w-]{1,100}$/);
export const setNameSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();
const memberIds = z.array(setId).max(500);
export const createPromptSetSchema = setNameSchema.extend({
  workspace_id: setId,
  prompt_ids: memberIds.optional(),
});
export const updateSetMembersSchema = z.object({
  prompt_ids: memberIds.min(1),
  action: z.enum(["add", "remove"]),
}).strict();

export function requirePromptSet(env: Env, org: string, id: string, workspace?: string) {
  return one<{ id: string; workspace_id: string }>(env,
    "SELECT id, workspace_id FROM prompt_sets WHERE org_id=? AND id=?" + (workspace ? " AND workspace_id=?" : ""),
    org, id, ...(workspace ? [workspace] : []),
  ).then(row => required(row, "Prompt set not found"));
}

export function promptSetPredicate(promptAlias: string) {
  return `EXISTS (SELECT 1 FROM prompt_set_members m WHERE m.org_id=${promptAlias}.org_id
    AND m.workspace_id=${promptAlias}.workspace_id AND m.prompt_id=${promptAlias}.id AND m.set_id=?)`;
}

// Bind the selection as one JSON value to stay below D1's SQL parameter limit.
const selected = `SELECT id FROM prompts WHERE org_id=? AND workspace_id=? AND archived_at IS NULL
  AND id IN (SELECT value FROM json_each(?))`;

export async function promptSetsRoute(req: Request, env: Env, org: string, path: string, params: URLSearchParams) {
  const match = path.match(/^\/prompt-sets(?:\/([\w-]{1,100})(\/members)?)?$/);
  if (!match) throw new HttpError(404, "Prompt set route not found");
  const [, set, members] = match;
  if (!members && req.method === "GET") {
    const workspace = params.get("workspace");
    if (workspace && !setId.safeParse(workspace).success) throw new HttpError(400, "Invalid workspace");
    if (workspace) required(await one(env, "SELECT id FROM workspaces WHERE org_id=? AND id=? AND archived_at IS NULL", org, workspace));
    const sets = await all(env, `WITH selected_sets AS (
      SELECT id, org_id, workspace_id, name FROM prompt_sets
      WHERE org_id=?${workspace ? " AND workspace_id=?" : ""}${set ? " AND id=?" : ""}
    ), members AS (
      SELECT s.id AS set_id, p.org_id, p.workspace_id, p.id, p.question_id, p.engine
      FROM selected_sets s
      JOIN prompt_set_members m ON (m.org_id,m.workspace_id,m.set_id)=(s.org_id,s.workspace_id,s.id)
      JOIN prompt_engines p ON (p.org_id,p.workspace_id,p.id)=(m.org_id,m.workspace_id,m.prompt_id)
      WHERE p.archived_at IS NULL
    ), schedule_state AS (
      SELECT prompt_id, max(enabled) AS active,
        min(CASE WHEN enabled=1 THEN next_due_at END) AS next_scheduled_at
      FROM schedules
      WHERE org_id=? AND prompt_id IN (SELECT id FROM members)
      GROUP BY prompt_id
    ), statistics AS (
      SELECT m.set_id, count(*) AS member_count, count(DISTINCT m.question_id) AS question_count,
        json_group_array(DISTINCT m.engine ORDER BY m.engine) AS engines,
        sum(coalesce(sc.active,0)) AS scheduled_count,
        sum(CASE WHEN sc.active=0 THEN 1 ELSE 0 END) AS paused_count,
        sum(CASE WHEN sc.active IS NULL THEN 1 ELSE 0 END) AS unscheduled_count,
        min(sc.next_scheduled_at) AS next_scheduled_at,
        max(EXISTS(SELECT 1 FROM runs r
          WHERE (r.org_id,r.prompt_id,r.workspace_id)=(m.org_id,m.id,m.workspace_id))) AS has_runs,
        max((SELECT max(r.updated_at) FROM runs r
          WHERE (r.org_id,r.prompt_id,r.workspace_id)=(m.org_id,m.id,m.workspace_id)
            AND r.status='succeeded')) AS last_completed_at
      FROM members m LEFT JOIN schedule_state sc ON sc.prompt_id=m.id
      GROUP BY m.set_id
    )
    SELECT s.id,s.workspace_id,s.name,coalesce(t.member_count,0) AS member_count,
      coalesce(t.question_count,0) AS question_count,coalesce(t.engines,'[]') AS engines,
      coalesce(t.scheduled_count,0) AS scheduled_count,coalesce(t.paused_count,0) AS paused_count,
      coalesce(t.unscheduled_count,0) AS unscheduled_count,coalesce(t.has_runs,0) AS has_runs,t.next_scheduled_at,t.last_completed_at
    FROM selected_sets s LEFT JOIN statistics t ON t.set_id=s.id
    ORDER BY s.name COLLATE NOCASE,s.id`, org, ...(workspace ? [workspace] : []), ...(set ? [set] : []), org);
    const summaries = sets.map(row => ({ ...row, has_runs: !!row.has_runs, engines: JSON.parse(String(row.engines)) as string[] }));
    return json(set ? { set: required(summaries[0], "Prompt set not found") } : { sets: summaries });
  }
  if (!set && req.method === "POST") {
    const input = await body(req, createPromptSetSchema, 64 * 1024);
    const workspace = input.workspace_id;
    const ids = [...new Set(input.prompt_ids)];
    const selection = [org, workspace, JSON.stringify(ids)];
    const id = uuid();
    const [created] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO prompt_sets(id,org_id,workspace_id,name)
        SELECT ?,org_id,id,? FROM workspaces WHERE org_id=? AND id=? AND archived_at IS NULL
        AND (SELECT count(*) FROM (${selected}))=?`).bind(id, input.name, org, workspace, ...selection, ids.length),
      env.DB.prepare(`INSERT INTO prompt_set_members(org_id,workspace_id,set_id,prompt_id)
        SELECT ?,?,?,id FROM (${selected}) WHERE EXISTS(SELECT 1 FROM prompt_sets WHERE org_id=? AND id=?)`)
        .bind(org, workspace, id, ...selection, org, id),
    ]);
    if (!created.meta.changes) throw new HttpError(404, "Workspace or selected prompt not found in this workspace");
    return json({ id }, 201);
  }
  if (set) {
    const { workspace_id: workspace } = await requirePromptSet(env, org, set);
    if (!members && req.method === "PATCH") {
      const { name } = await body(req, setNameSchema);
      await exec(env, "UPDATE prompt_sets SET name=? WHERE org_id=? AND id=?", name, org, set);
      return json({ ok: true });
    }
    if (!members && req.method === "DELETE") {
      await exec(env, "DELETE FROM prompt_sets WHERE org_id=? AND id=?", org, set);
      return json({ ok: true });
    }
    if (members && req.method === "PATCH") {
      const { prompt_ids, action } = await body(req, updateSetMembersSchema, 64 * 1024);
      const ids = [...new Set(prompt_ids)];
      const selection = [org, workspace, JSON.stringify(ids)];
      const valid = `EXISTS(SELECT 1 FROM prompt_sets WHERE org_id=? AND id=?)
        AND (SELECT count(*) FROM (${selected}))=?`;
      const validation = [org, set, ...selection, ids.length];
      const mutation = action === "add"
        ? env.DB.prepare(`INSERT OR IGNORE INTO prompt_set_members(org_id,workspace_id,set_id,prompt_id)
            SELECT ?,?,?,id FROM (${selected}) WHERE ${valid}`).bind(org, workspace, set, ...selection, ...validation)
        : env.DB.prepare(`DELETE FROM prompt_set_members WHERE org_id=? AND workspace_id=? AND set_id=?
            AND prompt_id IN (SELECT value FROM json_each(?)) AND ${valid}`).bind(org, workspace, set, selection[2], ...validation);
      const [check, result] = await env.DB.batch<{ valid: number }>([
        env.DB.prepare(`SELECT ${valid} AS valid`).bind(...validation),
        mutation,
      ]);
      if (!check.results[0]?.valid) throw new HttpError(404, "Prompt set or selected prompt not found in this workspace");
      return json({ changed: result.meta.changes });
    }
  }
  throw new HttpError(404, "Prompt set route not found");
}
