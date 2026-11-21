import { all, exec, now, type Env } from "./types";

export const WORKFLOW_BATCH_SIZE = 100;
export const workflowId = (runId: string, generation: number) => generation ? `${runId}-${generation}` : runId;

export async function launchRuns(env: Env, runIds?: string[]) {
  if (runIds && !runIds.length) return 0;
  const rows = await all<{ id: string; workflow_generation: number }>(env, `
    SELECT id,workflow_generation FROM (
      SELECT id,workflow_generation,created_at,ROW_NUMBER() OVER(PARTITION BY org_id ORDER BY created_at,id) AS tenant_position
      FROM runs WHERE status IN ('queued','submitted') AND workflow_started=0
      ${runIds ? "AND id IN (SELECT value FROM json_each(?))" : ""}
    ) ORDER BY tenant_position,created_at,id LIMIT ${WORKFLOW_BATCH_SIZE}
  `, ...(runIds ? [JSON.stringify(runIds)] : []));
  if (!rows.length) return 0;
  const instances = rows.map(row => ({
    id: workflowId(row.id, row.workflow_generation),
    params: { runId: row.id, generation: row.workflow_generation },
  }));
  const result = await env.RUN_WORKFLOW.createBatch({ instances });
  const confirmed = new Set(result.created.map(instance => instance.id));
  for (const error of result.errors) {
    if (error.code === 10405 && instances[error.index]) confirmed.add(instances[error.index].id);
  }
  const updates = rows.filter((_, index) => confirmed.has(instances[index].id)).map(row =>
    env.DB.prepare("UPDATE runs SET workflow_started=1,workflow_dispatched_at=? WHERE id=? AND workflow_generation=? AND workflow_started=0")
      .bind(now(), row.id, row.workflow_generation),
  );
  if (updates.length) await env.DB.batch(updates);
  return updates.length;
}

export async function launchCollectionRuns(env: Env, runIds: string[]) {
  for (let offset = 0; offset < runIds.length; offset += WORKFLOW_BATCH_SIZE) {
    const end = offset + WORKFLOW_BATCH_SIZE;
    await launchRuns(env, runIds.slice(offset, end));
    // Leave unstarted runs eligible for Cron and space calls for Cloudflare's creation rate.
    if (end < runIds.length) await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

export async function releaseQueuedWorkflow(env: Env, runId: string, generation: number) {
  await exec(env, `UPDATE runs SET workflow_generation=workflow_generation+1,workflow_started=0,workflow_dispatched_at=0
    WHERE id=? AND workflow_generation=? AND status='queued'`, runId, generation);
}

export async function recoverQueuedWorkflows(env: Env, time: number) {
  await exec(env, `UPDATE runs SET workflow_generation=workflow_generation+1,workflow_started=0,workflow_dispatched_at=0
    WHERE status='queued' AND workflow_started=1 AND workflow_dispatched_at<=?`, time - 15 * 60_000);
}
