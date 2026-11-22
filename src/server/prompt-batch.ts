import { promptQuestionText } from "./prompt-questions";
import { hashToken } from "./crypto";
import { setId, setNameSchema } from "./prompt-sets";
import { promptTags } from "./prompt-tags";
import {assertProviderOptions} from "./provider-options";
import {z} from 'zod';
import { HttpError, now, one, uuid, type Env} from './types';
import { MAX_PROMPT_COMBINATIONS } from '../lib/prompt-input';
import { requireWorkspaceBrand } from './workspace-brands';

// JSON escape sequences can expand one character to six bytes.
export const MAX_PROMPT_BATCH_BYTES = 6 * 700 * MAX_PROMPT_COMBINATIONS + 16_384;
export const promptBatchSchema=z.object({
 workspace_id:z.string().min(1).max(100),brand_id:z.string().min(1).max(100).nullable().optional(),
 texts:z.array(promptQuestionText).min(1).max(MAX_PROMPT_COMBINATIONS),
 engines:z.array(z.enum(['chatgpt','gemini','google'])).min(1).max(3),
 operation_id:z.uuid().optional(),
 tracking_set_name:setNameSchema.shape.name.optional(),
 tracking_set_id:setId.optional(),
 tags:promptTags.optional(),
 mode:z.enum(['standard','priority','live']).default('standard'),location_name:z.string().trim().min(2).max(200).default('United States'),language_code:z.string().min(2).max(20).default('en'),
}).strict();
const sameCombination = `p.org_id=? AND p.workspace_id=? AND coalesce(p.brand_id,'')=?
  AND p.text=json_extract(c.value,'$.text') AND p.engine=json_extract(c.value,'$.engine')
  AND p.mode=? AND p.location_name=? AND p.language_code=? AND p.archived_at IS NULL`;

type Combination = {
 id: string | null;
 text: string;
 engine: string;
 monitoring: "active" | "paused" | "none";
 outcome: "new" | "created" | "reused" | "updated";
};

async function reviewPromptBatch(env: Env, org: string, input: unknown, save: boolean, action?: unknown) {
 const b=promptBatchSchema.parse(input);const texts=[...new Set(b.texts)],engines=[...new Set(b.engines)];
 const hasTrackingSet = b.tracking_set_name !== undefined || b.tracking_set_id !== undefined;
 if (b.tracking_set_name && b.tracking_set_id)
  throw new HttpError(400, "Choose a new name or an existing tracking set.");
 if (save && hasTrackingSet && !b.operation_id)
  throw new HttpError(400, "An operation ID is required to save questions to a tracking set.");
 const payloadHash = b.operation_id && save
  ? await hashToken(JSON.stringify(hasTrackingSet ? { prompts: b, action: action ?? null } : b)) : null;
 if (payloadHash) {
  const stored = await storedReceipt(env, org, b.operation_id!);
  if (stored) return replayReceipt(stored, payloadHash);
 }
 const combinations = texts.length * engines.length;
 if (combinations > MAX_PROMPT_COMBINATIONS)
  throw new HttpError(400, `Detected ${combinations} prompt/engine combinations. Save at most ${MAX_PROMPT_COMBINATIONS} per batch.`);
 const workspace = await one<{ id: string; name: string }>(env, 'SELECT id,name FROM workspaces WHERE id=? AND org_id=? AND archived_at IS NULL',b.workspace_id,org);
 if (!workspace) throw new HttpError(404, 'Workspace not found');
 const existingSet = b.tracking_set_id
  ? await one<{ id: string; name: string }>(env, "SELECT id,name FROM prompt_sets WHERE org_id=? AND workspace_id=? AND id=?", org, workspace.id, b.tracking_set_id)
  : null;
 if (b.tracking_set_id && !existingSet) throw new HttpError(404, "Tracking set not found in this workspace");
 await requireWorkspaceBrand(env,org,b.workspace_id,b.brand_id);
 await assertProviderOptions(engines,b.location_name,b.language_code);
 const entries = texts.flatMap(text => engines.map(engine => ({ text, engine, id: uuid() })));
 const selection = JSON.stringify(entries);
 const scope = [org, b.workspace_id, b.brand_id ?? "", b.mode, b.location_name, b.language_code];
 const reviewSql = `SELECT p.id, json_extract(c.value,'$.text') AS text,
   json_extract(c.value,'$.engine') AS engine,
   CASE WHEN EXISTS(SELECT 1 FROM schedules s WHERE s.org_id=p.org_id AND s.prompt_id=p.id AND s.enabled=1)
     THEN 'active' WHEN EXISTS(SELECT 1 FROM schedules s WHERE s.org_id=p.org_id AND s.prompt_id=p.id)
     THEN 'paused' ELSE 'none' END AS monitoring,
   CASE WHEN p.id IS NULL THEN 'new'
     WHEN ? AND p.id=json_extract(c.value,'$.id') THEN 'created' ELSE 'reused' END AS outcome
   FROM json_each(?) c LEFT JOIN prompts p ON p.id=(
     SELECT p.id FROM prompts p WHERE ${sameCombination}
     ORDER BY p.created_at,p.id LIMIT 1
   ) ORDER BY c.key`;
 const reviewArgs = [Number(save), selection, ...scope];
 const review = env.DB.prepare(reviewSql).bind(...reviewArgs);
 if (!save) {
  const { results } = await review.all<Combination>();
  return { workspace, questions: texts.length, saved_combinations: 0, prompts: results };
 }

 const time = now();
 const tags = b.tags === undefined ? null : JSON.stringify(b.tags);
 const receiptGuard = b.operation_id ? " AND NOT EXISTS(SELECT 1 FROM prompt_receipts WHERE org_id=? AND id=?)" : "";
 const guardArgs = b.operation_id ? [org, b.operation_id] : [];
 const setExists = "EXISTS(SELECT 1 FROM prompt_sets WHERE org_id=? AND workspace_id=? AND id=?)";
 const workspaceExists = "EXISTS(SELECT 1 FROM workspaces WHERE org_id=? AND id=? AND archived_at IS NULL)";
 const targetGuard = existingSet ? " AND " + setExists : hasTrackingSet ? " AND " + workspaceExists : "";
 const targetArgs = existingSet ? [org, b.workspace_id, existingSet.id] : hasTrackingSet ? [org, b.workspace_id] : [];
 const insert = env.DB.prepare(`INSERT INTO prompts(id,org_id,workspace_id,brand_id,text,engine,mode,
   location_name,language_code,created_at,updated_at,tags)
   SELECT json_extract(c.value,'$.id'),?,?,?,json_extract(c.value,'$.text'),
     json_extract(c.value,'$.engine'),?,?,?,?,?,?
   FROM json_each(?) c
   WHERE NOT EXISTS(SELECT 1 FROM prompts p WHERE ${sameCombination})${receiptGuard}${targetGuard}`)
  .bind(org, b.workspace_id, b.brand_id ?? null, b.mode, b.location_name, b.language_code,
   time, time, tags ?? "[]", selection, ...scope, ...guardArgs, ...targetArgs);
 if (payloadHash) {
  const trackingSet = existingSet ?? (b.tracking_set_name ? { id: uuid(), name: b.tracking_set_name } : null);
  const statements = [insert];
  if (trackingSet && !existingSet) {
   statements.push(env.DB.prepare(`INSERT INTO prompt_sets(id,org_id,workspace_id,name)
     SELECT ?,org_id,id,? FROM workspaces WHERE org_id=? AND id=? AND archived_at IS NULL${receiptGuard}`)
    .bind(trackingSet.id, trackingSet.name, org, b.workspace_id, ...guardArgs));
  }
  if (trackingSet) {
   statements.push(env.DB.prepare(`INSERT OR IGNORE INTO prompt_set_members(org_id,workspace_id,set_id,prompt_id)
     SELECT ?,?,?,id FROM (${reviewSql}) WHERE id IS NOT NULL AND ${setExists}${receiptGuard}`)
    .bind(org, b.workspace_id, trackingSet.id, ...reviewArgs, org, b.workspace_id, trackingSet.id, ...guardArgs));
  }
  const receiptSetGuard = trackingSet ? " HAVING " + setExists : "";
  const receiptSetArgs = trackingSet ? [org, b.workspace_id, trackingSet.id] : [];
  const saveReceipt = env.DB.prepare(`INSERT OR IGNORE INTO prompt_receipts(org_id,id,payload_hash,receipt,created_at)
    SELECT ?,?,?,json_patch(json_object('id',?,'workspace',json(?),'questions',?,'saved_combinations',count(id),
      'prompts',json_group_array(json_object('id',id,'text',text,'engine',engine,'monitoring',monitoring,'outcome',outcome))),json(?)),?
    FROM (${reviewSql})${receiptSetGuard}`).bind(org, b.operation_id, payloadHash, b.operation_id, JSON.stringify(workspace), texts.length, JSON.stringify(trackingSet ? { tracking_set: trackingSet } : {}), time, ...reviewArgs, ...receiptSetArgs);
  await env.DB.batch([...statements, saveReceipt]);
  const stored = await storedReceipt(env, org, b.operation_id!);
  if (!stored) throw new HttpError(409, "The save receipt is unavailable. Retry the same operation.");
  return replayReceipt(stored, payloadHash);
 }
 // D1 serializes the match check, insertion and receipt read in the same transaction.
 const results = await env.DB.batch<Combination>([insert, review]);
 const prompts = results.at(-1)!.results;
 return { workspace, questions: texts.length, saved_combinations: prompts.filter(prompt => prompt.id).length, prompts };
}

export function previewPromptBatch(env: Env, org: string, input: unknown) {
 return reviewPromptBatch(env, org, input, false);
}

export function savePromptBatch(env: Env, org: string, input: unknown, action?: unknown) {
 return reviewPromptBatch(env, org, input, true, action);
}

type Receipt = { id?: string; tracking_set?: { id: string; name: string }; workspace: { id: string; name: string }; questions: number; saved_combinations: number; prompts: Combination[] };

function storedReceipt(env: Env, org: string, id: string) {
 return one<{ payload_hash: string; receipt: string }>(env, "SELECT payload_hash,receipt FROM prompt_receipts WHERE org_id=? AND id=?", org, id);
}

function replayReceipt(stored: { payload_hash: string; receipt: string }, hash: string): Receipt {
 if (stored.payload_hash !== hash) throw new HttpError(409, "This operation ID belongs to a different prompt submission.");
 return JSON.parse(stored.receipt);
}

export async function getPromptReceipt(env: Env, org: string, id: string): Promise<Receipt> {
 const stored = await storedReceipt(env, org, id);
 if (!stored) throw new HttpError(404, "Prompt receipt not found");
 return JSON.parse(stored.receipt);
}
