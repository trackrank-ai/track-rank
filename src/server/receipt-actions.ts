import { z } from "zod";
import { bulkScheduleSchema, createBulkRuns, createBulkSchedules, selectedRows } from "./bulk";
import { getPromptReceipt, promptBatchSchema, savePromptBatch } from "./prompt-batch";
import { exec, HttpError, one, type Env } from "./types";

function validateTimezone(timezone?: string) {
  if (!timezone) return;
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); }
  catch { throw new HttpError(400, "Choose a valid timezone"); }
}

const collectionActionFields = z.object({
  run_samples: z.number().int().min(1).max(10).optional(),
  schedule: bulkScheduleSchema.omit({ prompt_ids: true, batch_id: true, only_unscheduled: true }).optional(),
}).strict();

export const receiptActionSchema = collectionActionFields.extend({
  prompt_ids: bulkScheduleSchema.shape.prompt_ids,
}).refine(value => value.run_samples || value.schedule, "Choose a collection or schedule action");

export const submitPromptBatchSchema = z.object({
  prompts: promptBatchSchema.extend({ operation_id: z.uuid() }),
  action: collectionActionFields.extend({
    approved: z.array(z.object({
      question: z.number().int().min(0).max(499),
      engine: z.enum(["chatgpt", "gemini", "google"]),
    }).strict()).min(1).max(500),
  }).refine(value => value.run_samples || value.schedule, "Choose a collection or schedule action").optional(),
}).strict();

export async function submitPromptBatch(
  env: Env, org: string, input: z.output<typeof submitPromptBatchSchema>,
  dispatch: (ids: string[]) => void,
) {
  const { prompts, action } = input;
  validateTimezone(action?.schedule?.timezone);
  const texts = [...new Set(prompts.texts)];
  const approved = new Set<string>();
  for (const item of action?.approved ?? []) {
    if (!texts[item.question] || !prompts.engines.includes(item.engine))
      throw new HttpError(400, "The confirmed combination is outside the submitted selection");
    approved.add(JSON.stringify([texts[item.question], item.engine]));
  }
  const receipt = await savePromptBatch(env, org, prompts);
  const ids = receipt.prompts.filter(row => row.outcome === "created" && approved.has(JSON.stringify([row.text, row.engine])))
    .map(row => row.id as string);
  const result = action && ids.length ? await applyReceiptAction(env, org, prompts.operation_id, {
    prompt_ids: ids, run_samples: action.run_samples, schedule: action.schedule,
  }, dispatch) : null;
  return { ...receipt, result };
}

function storedAction(env: Env, org: string, id: string) {
  return one<{payload: string; run_result: string | null; schedule_result: string | null}>(env,
    "SELECT payload,run_result,schedule_result FROM prompt_receipt_actions WHERE org_id=? AND receipt_id=?", org, id);
}

export async function readReceiptAction(env: Env, org: string, id: string) {
  const action = await storedAction(env, org, id);
  return action ? {
    selection: receiptActionSchema.parse(JSON.parse(action.payload)),
    run: action.run_result ? JSON.parse(action.run_result) : null,
    schedule: action.schedule_result ? JSON.parse(action.schedule_result) : null,
  } : null;
}

export async function applyReceiptAction(
  env: Env, org: string, id: string, input: z.output<typeof receiptActionSchema>,
  dispatch: (ids: string[]) => void,
) {
  validateTimezone(input.schedule?.timezone);
  const receipt = await getPromptReceipt(env, org, id);
  const promptIds = [...new Set(input.prompt_ids)].sort();
  const permitted = new Set(receipt.prompts.filter(prompt => prompt.outcome === "created").map(prompt => prompt.id));
  if (promptIds.some(prompt => !permitted.has(prompt))) throw new HttpError(409, "Choose new prompt combinations from this receipt");
  const payload = JSON.stringify({ ...input, prompt_ids: promptIds });
  const previous = await storedAction(env, org, id);
  if (!previous) {
    const prompts = await selectedRows(env, org, "prompts", promptIds, null);
    if (prompts.some(prompt => prompt.workspace_id !== receipt.workspace.id)) throw new HttpError(409, "The selection changed workspace");
    await exec(env, "INSERT OR IGNORE INTO prompt_receipt_actions(org_id,receipt_id,payload) VALUES(?,?,?)", org, id, payload);
  }
  const action = await storedAction(env, org, id);
  if (action?.payload !== payload) throw new HttpError(409, "This receipt already has a different collection action");
  let run = action.run_result ? JSON.parse(action.run_result) : null;
  let schedule = action.schedule_result ? JSON.parse(action.schedule_result) : null;
  try {
    if (input.run_samples && !run?.complete) {
      const { dispatchIds, ...result } = await createBulkRuns(env, org, {
        prompt_ids: promptIds, repetitions: input.run_samples, batch_key: id, include_runs: false, receipt_id: id, expected_workspace_id: receipt.workspace.id,
      });
      dispatch(dispatchIds);
      run = result;
      await exec(env, `UPDATE prompt_receipt_actions SET run_result=?
        WHERE org_id=? AND receipt_id=? AND coalesce(json_extract(run_result,'$.accepted'),0)<=?`,
      JSON.stringify(result), org, id, result.accepted);
      if (!result.complete) return { run, schedule, error: result.error };
    }
    if (input.schedule && !schedule) {
      schedule = await createBulkSchedules(env, org, { ...input.schedule, prompt_ids: promptIds, batch_id: id, only_unscheduled: true });
      await exec(env, "UPDATE prompt_receipt_actions SET schedule_result=? WHERE org_id=? AND receipt_id=? AND schedule_result IS NULL",
        JSON.stringify(schedule), org, id);
    }
    return { run, schedule };
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return { run, schedule, error: error.message };
  }
}
