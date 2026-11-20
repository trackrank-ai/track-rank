import { exec, type Env } from "./types";
export async function launchRun(env: Env, runId: string) {
  try {
    await env.RUN_WORKFLOW.create({ id: runId, params: { runId } });
    await exec(env, "UPDATE runs SET workflow_started=1 WHERE id=?", runId);
  } catch {
    // An existing instance is expected on cron recovery; any other creation failure leaves the run queued.
    const instance = await env.RUN_WORKFLOW.get(runId);
    await instance.status();
    await exec(env, "UPDATE runs SET workflow_started=1 WHERE id=?", runId);
  }
}
