import { all, HttpError, now, type Env } from "./types";

export async function previewPromptDeletion(env: Env, org: string, ids: string[]) {
  const selected = [...new Set(ids)];
  const variants = await all(env, `SELECT p.id,p.question_id,p.text,p.engine,p.location_name,p.language_code,
    (SELECT count(*) FROM schedules s WHERE s.org_id=p.org_id AND s.prompt_id=p.id) AS schedules,
    (SELECT count(*) FROM prompt_engines e WHERE e.org_id=p.org_id AND e.question_id=p.question_id AND e.archived_at IS NULL) AS question_variants
    FROM prompts p WHERE p.org_id=? AND p.archived_at IS NULL AND p.id IN (SELECT value FROM json_each(?))`, org, JSON.stringify(selected));
  if (variants.length !== selected.length) throw new HttpError(404, "One or more selected engine variants are unavailable");
  return { variants };
}

export async function archivePrompts(env: Env, org: string, ids: string[]) {
  const values = [org, JSON.stringify(ids)];
  await env.DB.batch([
    env.DB.prepare("DELETE FROM schedules WHERE org_id=? AND prompt_id IN (SELECT value FROM json_each(?))").bind(...values),
    env.DB.prepare("UPDATE prompts SET archived_at=? WHERE org_id=? AND id IN (SELECT value FROM json_each(?)) AND archived_at IS NULL")
      .bind(now(), ...values),
  ]);
}

export async function archiveWorkspace(env: Env, org: string, id: string) {
  const archivedAt = now();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM schedules WHERE org_id=? AND prompt_id IN
      (SELECT id FROM prompts WHERE workspace_id=? AND org_id=?)`).bind(org, id, org),
    env.DB.prepare("UPDATE prompts SET archived_at=? WHERE org_id=? AND workspace_id=? AND archived_at IS NULL").bind(archivedAt, org, id),
    env.DB.prepare("DELETE FROM workspace_brands WHERE org_id=? AND workspace_id=?").bind(org, id),
    env.DB.prepare("UPDATE workspaces SET archived_at=?,brand_id=NULL WHERE org_id=? AND id=? AND archived_at IS NULL").bind(archivedAt, org, id),
  ]);
}

export async function deleteBrand(env: Env, org: string, id: string) {
  await env.DB.batch([
    env.DB.prepare("UPDATE workspaces SET brand_id=NULL WHERE org_id=? AND brand_id=?").bind(org, id),
    env.DB.prepare("UPDATE prompts SET brand_id=NULL WHERE org_id=? AND brand_id=?").bind(org, id),
    env.DB.prepare("DELETE FROM brands WHERE org_id=? AND id=?").bind(org, id),
  ]);
}
