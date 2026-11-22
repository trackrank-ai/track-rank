import { now, type Env } from "./types";

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
