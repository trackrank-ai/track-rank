import { all, one, required, type Env } from "./types";
import { trackedWorkspaceBrands } from "./workspace-brands";
import { credentialStatus, credentials } from "./provider-credentials";
import { eligibleAnswer, searchableHistoryWhere } from "./run-history";

export async function workspaceMonitoring(env: Env, org: string, workspaceId: string) {
  const workspace = required(await one(env,
    "SELECT id,name,brand_id FROM workspaces WHERE org_id=? AND id=? AND archived_at IS NULL", org, workspaceId));
  const history = await searchableHistoryWhere(env, org, new URLSearchParams({ workspace: workspaceId }));
  const [brands, provider, library, engines] = await Promise.all([
    trackedWorkspaceBrands(env, org, workspaceId),
    credentials(env, org).then(c => credentialStatus(c).dataforseo_configured),
    one<{ questions: number }>(env, "SELECT count(DISTINCT question_id) AS questions FROM prompt_engines WHERE org_id=? AND workspace_id=? AND archived_at IS NULL", org, workspaceId),
    all(env, `WITH active AS (
      SELECT org_id,id,engine FROM prompt_engines WHERE org_id=? AND workspace_id=? AND archived_at IS NULL
    ), variants AS (
      SELECT engine,count(*) AS variants FROM active GROUP BY engine
    ), timing AS (
      SELECT p.engine,count(*) AS schedules,sum(s.enabled) AS enabled_schedules,
        min(CASE WHEN s.enabled=1 THEN s.next_due_at END) AS next_check_at
      FROM active p JOIN schedules s ON s.org_id=p.org_id AND s.prompt_id=p.id GROUP BY p.engine
    ), evidence AS (
      SELECT json_extract(runs.config,'$.engine') AS engine,count(*) AS answers,max(created_at) AS last_answer_at
      FROM runs WHERE ${history.conditions.join(" AND ")} AND ${eligibleAnswer} GROUP BY 1
    ), engines AS (SELECT engine FROM variants UNION SELECT engine FROM evidence)
    SELECT engines.engine,coalesce(variants,0) AS variants,coalesce(schedules,0) AS schedules,
      coalesce(enabled_schedules,0) AS enabled_schedules,next_check_at,
      coalesce(answers,0) AS answers,last_answer_at FROM engines
      LEFT JOIN variants USING(engine) LEFT JOIN timing USING(engine) LEFT JOIN evidence USING(engine)
      WHERE engines.engine IS NOT NULL ORDER BY engines.engine`, org, workspaceId, ...history.bindings),
  ]);
  return { workspace, brands, questions: library?.questions ?? 0, dataforseo_configured: provider, engines };
}
