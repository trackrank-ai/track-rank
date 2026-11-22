import { handleQuestionConflict, promptQuestionText } from "./prompt-questions";
import { hashToken } from "./crypto";
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
 source_id:z.string().min(1).max(100).optional(),
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

async function reviewPromptBatch(env: Env, org: string, input: unknown, save: boolean) {
 const b=promptBatchSchema.parse(input);const texts=[...new Set(b.texts)],engines=[...new Set(b.engines)];
 const payloadHash = b.operation_id && save ? await hashToken(JSON.stringify(b)) : null;
 if (payloadHash) {
  const stored = await storedReceipt(env, org, b.operation_id!);
  if (stored) return replayReceipt(stored, payloadHash);
 }
 const combinations = texts.length * engines.length;
 if (combinations > MAX_PROMPT_COMBINATIONS)
  throw new HttpError(400, `Detected ${combinations} prompt/engine combinations. Save at most ${MAX_PROMPT_COMBINATIONS} per batch.`);
 if(b.source_id && texts.length!==1)throw new HttpError(400,'Edit one prompt at a time, or cancel editing to paste a batch.');
 const workspace = await one<{ id: string; name: string }>(env, 'SELECT id,name FROM workspaces WHERE id=? AND org_id=? AND archived_at IS NULL',b.workspace_id,org);
 if (!workspace) throw new HttpError(404, 'Workspace not found');
 await requireWorkspaceBrand(env,org,b.workspace_id,b.brand_id);
 if(b.source_id && !await one(env,'SELECT id FROM prompts WHERE id=? AND org_id=? AND archived_at IS NULL',b.source_id,org))throw new HttpError(404,'Prompt not found');
 await assertProviderOptions(engines,b.location_name,b.language_code);
 const entries = texts.flatMap(text => engines.map((engine, index) => ({
  text, engine, id: b.source_id && index === 0 ? b.source_id : uuid(),
  edit: Number(!!b.source_id && index === 0),
 })));
 const selection = JSON.stringify(entries);
 const scope = [org, b.workspace_id, b.brand_id ?? "", b.mode, b.location_name, b.language_code];
 const reviewSql = `SELECT p.id, json_extract(c.value,'$.text') AS text,
   json_extract(c.value,'$.engine') AS engine,
   CASE WHEN EXISTS(SELECT 1 FROM schedules s WHERE s.org_id=p.org_id AND s.prompt_id=p.id AND s.enabled=1)
     THEN 'active' WHEN EXISTS(SELECT 1 FROM schedules s WHERE s.org_id=p.org_id AND s.prompt_id=p.id)
     THEN 'paused' ELSE 'none' END AS monitoring,
   CASE WHEN p.id IS NULL THEN 'new' WHEN json_extract(c.value,'$.edit')=1 THEN 'updated'
     WHEN ? AND p.id=json_extract(c.value,'$.id') THEN 'created' ELSE 'reused' END AS outcome
   FROM json_each(?) c LEFT JOIN prompts p ON p.id=(
     SELECT p.id FROM prompts p WHERE p.org_id=? AND p.archived_at IS NULL AND
       ((json_extract(c.value,'$.edit')=1 AND p.id=json_extract(c.value,'$.id')) OR
        (json_extract(c.value,'$.edit')=0 AND ${sameCombination}))
     ORDER BY p.created_at,p.id LIMIT 1
   ) ORDER BY c.key`;
 const reviewArgs = [Number(save), selection, org, ...scope];
 const review = env.DB.prepare(reviewSql).bind(...reviewArgs);
 if (!save) {
  const { results } = await review.all<Combination>();
  return { workspace, questions: texts.length, saved_combinations: 0, prompts: results };
 }

 const time = now();
 const tags = b.tags === undefined ? null : JSON.stringify(b.tags);
 const statements = [];
 const receiptGuard = b.operation_id ? " AND NOT EXISTS(SELECT 1 FROM prompt_receipts WHERE org_id=? AND id=?)" : "";
 const guardArgs = b.operation_id ? [org, b.operation_id] : [];
 if (b.source_id) {
  statements.push(env.DB.prepare(`UPDATE prompts SET workspace_id=?,brand_id=?,text=?,engine=?,
    mode=?,location_name=?,language_code=?,updated_at=?,tags=coalesce(?,tags)
    WHERE id=? AND org_id=? AND archived_at IS NULL${receiptGuard}`)
   .bind(b.workspace_id, b.brand_id ?? null, texts[0], engines[0], b.mode, b.location_name,
    b.language_code, time, tags, b.source_id, org, ...guardArgs));
 }
 statements.push(env.DB.prepare(`INSERT INTO prompts(id,org_id,workspace_id,brand_id,text,engine,mode,
   location_name,language_code,created_at,updated_at,tags)
   SELECT json_extract(c.value,'$.id'),?,?,?,json_extract(c.value,'$.text'),
     json_extract(c.value,'$.engine'),?,?,?,?,?,?
   FROM json_each(?) c
   WHERE json_extract(c.value,'$.edit')=0 AND NOT EXISTS(SELECT 1 FROM prompts p WHERE ${sameCombination})${receiptGuard}`)
  .bind(org, b.workspace_id, b.brand_id ?? null, b.mode, b.location_name, b.language_code,
   time, time, tags ?? "[]", selection, ...scope, ...guardArgs));
 if (payloadHash) {
  statements.push(env.DB.prepare(`INSERT OR IGNORE INTO prompt_receipts(org_id,id,payload_hash,receipt,created_at)
    SELECT ?,?,?,json_object('id',?,'workspace',json(?),'questions',?,'saved_combinations',count(id),
      'prompts',json_group_array(json_object('id',id,'text',text,'engine',engine,'monitoring',monitoring,'outcome',outcome))),?
    FROM (${reviewSql})`).bind(org, b.operation_id, payloadHash, b.operation_id, JSON.stringify(workspace), texts.length, time, ...reviewArgs));
  await handleQuestionConflict(env.DB.batch(statements));
  const stored = await storedReceipt(env, org, b.operation_id!);
  if (!stored) throw new HttpError(409, "The save receipt is unavailable. Retry the same operation.");
  return replayReceipt(stored, payloadHash);
 }
 // D1 serializes the match check, insertion and receipt read in the same transaction.
 const results = await handleQuestionConflict(env.DB.batch<Combination>([...statements, review]));
 const prompts = results.at(-1)!.results;
 return { workspace, questions: texts.length, saved_combinations: prompts.filter(prompt => prompt.id).length, prompts };
}

export function previewPromptBatch(env: Env, org: string, input: unknown) {
 return reviewPromptBatch(env, org, input, false);
}

export function savePromptBatch(env: Env, org: string, input: unknown) {
 return reviewPromptBatch(env, org, input, true);
}

type Receipt = { id?: string; workspace: { id: string; name: string }; questions: number; saved_combinations: number; prompts: Combination[] };

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
