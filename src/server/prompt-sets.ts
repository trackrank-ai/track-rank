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
  if (!set && req.method === "GET") {
    const workspace = params.get("workspace");
    if (workspace && !setId.safeParse(workspace).success) throw new HttpError(400, "Invalid workspace");
    if (workspace) required(await one(env, "SELECT id FROM workspaces WHERE org_id=? AND id=? AND archived_at IS NULL", org, workspace));
    return json({ sets: await all(env, `SELECT s.id,s.workspace_id,s.name,
      (SELECT count(*) FROM prompt_set_members m WHERE m.org_id=s.org_id AND m.workspace_id=s.workspace_id AND m.set_id=s.id) AS member_count
      FROM prompt_sets s WHERE s.org_id=?${workspace ? " AND s.workspace_id=?" : ""}
      ORDER BY s.name COLLATE NOCASE,s.id`, org, ...(workspace ? [workspace] : [])) });
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
