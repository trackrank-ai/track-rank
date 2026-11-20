import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { collectRun, executeRun } from "./provider";
import { exec, now, one, type Env, type Row } from "./types";
export class TrackingWorkflow extends WorkflowEntrypoint<
  Env,
  { runId: string }
> {
  async run(event: WorkflowEvent<{ runId: string }>, step: WorkflowStep) {
    const id = event.payload.runId;
    for (let admission = 0; admission < 720; admission++) {
      const state = await step.do(
        `admit and submit ${admission}`,
        { retries: { limit: 0, delay: "1 second" }, timeout: "4 minutes" },
        async () => {
          await executeRun(this.env, id);
          return (
            await one<Row>(this.env, "SELECT status FROM runs WHERE id=?", id)
          )?.status as string;
        },
      );
      if (state !== "queued") break;
      await step.sleep(
        `wait for organization capacity ${admission}`,
        "1 minute",
      );
    }
    for (let i = 0; i < 864; i++) {
      const state = await step.do(
        `collect result ${i}`,
        {
          retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
          timeout: "3 minutes",
        },
        async () => {
          const r = await one<Row>(
            this.env,
            "SELECT * FROM runs WHERE id=?",
            id,
          );
          if (!r) return "missing";
          if (r.status === "submitted") await collectRun(this.env, r);
          return (
            await one<Row>(this.env, "SELECT status FROM runs WHERE id=?", id)
          )?.status as string;
        },
      );
      if (state !== "submitted") return { runId: id, status: state };
      // Signed provider callback wakes us early. A timeout recovers lost callbacks with polling.
      try {
        await step.waitForEvent(`provider signal ${i}`, {
          type: "provider-ready",
          timeout: "5 minutes",
        });
      } catch {
        /* next iteration checks the same external task, never resubmits */
      }
    }
    await step.do("expire uncompleted task", async () => {
      await exec(
        this.env,
        "UPDATE runs SET status='failed',error='Provider task timed out after 72 hours',updated_at=? WHERE id=? AND status='submitted'",
        now(),
        id,
      );
      return true;
    });
    return { runId: id, status: "expired" };
  }
}
