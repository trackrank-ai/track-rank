import {assertProviderOptions} from "./provider-options";
import {z} from 'zod';
import {all, HttpError, now, one, uuid, type Env} from './types';
import { MAX_PROMPT_COMBINATIONS } from '../lib/prompt-input';
import { requireWorkspaceBrand } from './workspace-brands';

// JSON escape sequences can expand one character to six bytes.
export const MAX_PROMPT_BATCH_BYTES = 6 * 700 * MAX_PROMPT_COMBINATIONS + 16_384;
export const promptBatchSchema=z.object({
 workspace_id:z.string().min(1).max(100),brand_id:z.string().min(1).max(100).nullable().optional(),
 texts:z.array(z.string().trim().min(3).max(700)).min(1).max(MAX_PROMPT_COMBINATIONS),
 engines:z.array(z.enum(['chatgpt','gemini','google'])).min(1).max(3),
 source_id:z.string().min(1).max(100).optional(),
 mode:z.enum(['standard','priority','live']).default('standard'),location_name:z.string().trim().min(2).max(200).default('United States'),language_code:z.string().min(2).max(20).default('en'),enabled:z.boolean().default(true),
}).strict();
export async function savePromptBatch(env:Env,org:string,input:unknown){
 const b=promptBatchSchema.parse(input);const texts=[...new Set(b.texts)],engines=[...new Set(b.engines)];
 const combinations = texts.length * engines.length;
 if (combinations > MAX_PROMPT_COMBINATIONS)
  throw new HttpError(400, `Detected ${combinations} prompt/engine combinations. Save at most ${MAX_PROMPT_COMBINATIONS} per batch.`);
 if(b.source_id && texts.length!==1)throw new HttpError(400,'Edit one prompt at a time, or cancel editing to paste a batch.');
 if(!await one(env,'SELECT id FROM workspaces WHERE id=? AND org_id=?',b.workspace_id,org))throw new HttpError(404,'Workspace not found');
 await requireWorkspaceBrand(env,org,b.workspace_id,b.brand_id);
 if(b.source_id && !await one(env,'SELECT id FROM prompts WHERE id=? AND org_id=?',b.source_id,org))throw new HttpError(404,'Prompt not found');
 await assertProviderOptions(engines,b.location_name,b.language_code);
 const statements=[];const t=now();
 for(const text of texts)for(const [index,engine] of engines.entries()){
  if(b.source_id && index===0){statements.push(env.DB.prepare('UPDATE prompts SET workspace_id=?,brand_id=?,text=?,engine=?,mode=?,location_name=?,language_code=?,enabled=?,updated_at=? WHERE id=? AND org_id=?').bind(b.workspace_id,b.brand_id||null,text,engine,b.mode,b.location_name,b.language_code,Number(b.enabled),t,b.source_id,org));continue;}
  statements.push(env.DB.prepare(`INSERT INTO prompts(id,org_id,workspace_id,brand_id,text,engine,mode,location_name,language_code,enabled,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM prompts WHERE org_id=? AND workspace_id=? AND COALESCE(brand_id,'')=? AND text=? AND engine=? AND mode=? AND location_name=? AND language_code=?)`).bind(uuid(),org,b.workspace_id,b.brand_id||null,text,engine,b.mode,b.location_name,b.language_code,Number(b.enabled),t,t,org,b.workspace_id,b.brand_id||'',text,engine,b.mode,b.location_name,b.language_code));
 }
 await env.DB.batch(statements);
 return {saved_combinations:combinations,prompts:await all(env,'SELECT id,text,engine FROM prompts WHERE org_id=? AND workspace_id=? ORDER BY created_at DESC LIMIT 100',org,b.workspace_id)};
}
