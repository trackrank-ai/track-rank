import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { collectRun, executeRun } from "./provider";
import { releaseQueuedWorkflow } from "./dispatch";
import { now, one, type Env } from "./types";

type Parameters = { runId: string; generation?: number };
export class TrackingWorkflow extends WorkflowEntrypoint<Env, Parameters> {
  async run(event: WorkflowEvent<Parameters>, step: WorkflowStep) {
    const { runId, generation = 0 } = event.payload;
    const readRun = () => one(this.env, "SELECT * FROM runs WHERE id=? AND workflow_generation=?", runId, generation);
    let state: unknown;
    for (let attempt = 0; attempt < 10; attempt++) {
      state = await step.do(`submit ${attempt}`, { retries: { limit: 0, delay: "1 second" }, timeout: "4 minutes" }, async () => {
        await executeRun(this.env, runId, generation);
        return (await readRun())?.status ?? "missing";
      });
      if (state !== "queued" && state !== "submitting") break;
      await step.sleep(`wait for submission ${attempt}`, "1 minute");
    }
    if (state === "queued") {
      await step.do("release queued run", async () => {
        await releaseQueuedWorkflow(this.env, runId, generation);
      });
      return { runId, status: "queued" };
    }
    // Cron also recovers accepted tasks when this Workflow terminates or misses a callback.
    let notified = false;
    for (let poll = 0; poll < 400; poll++) {
      state = await step.do(`collect ${poll}`, { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "2 minutes" }, async () => {
        const run = await readRun();
        if (run?.status === "submitted" && Number(run.submitted_at) > now() - 72 * 3600_000) await collectRun(this.env, run, 30_000, notified);
        return (await readRun())?.status ?? "missing";
      });
      if (state !== "submitted" && state !== "submitting") return { runId, status: state };
      notified = false;
      try {
        await step.waitForEvent(`provider notification ${poll}`, { type: "provider-ready", timeout: "5 minutes" });
        notified = true;
      } catch {
        // Fall back to polling this task.
      }
    }
    return { runId, status: state };
  }
}
