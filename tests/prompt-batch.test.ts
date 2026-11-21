import {test} from 'node:test';import assert from 'node:assert/strict';import {parsePromptInput} from '../src/lib/prompt-input';import {savePromptBatch} from '../src/server/prompt-batch';import {fixture} from './helpers/billing-fixture';
const base={workspace_id:'space',texts:['Best cleaners?','Affordable cleaners?'],engines:['chatgpt','gemini','google']};
function setup(){const f=fixture();f.sql.exec("INSERT INTO workspaces(id,org_id,name,created_at) VALUES('space','org','Space',0)");return f;}
test('paste supports lines or quoted commas; lines preserve natural punctuation and duplicate prompts collapse',()=>{
 assert.deepEqual(parsePromptInput('Best cleaners?\nCleaners, near Seattle?\r\nBest cleaners?'),['Best cleaners?','Cleaners, near Seattle?']);assert.deepEqual(parsePromptInput('Best cleaners?, "Cleaners, near Seattle?"'),['Best cleaners?','Cleaners, near Seattle?']);assert.deepEqual(parsePromptInput('Cleaners, near Seattle?','lines'),['Cleaners, near Seattle?']);assert.throws(()=>parsePromptInput('"Missing close, quote'),/Close the quoted/);
});
test('batch atomically saves engine variants, reuses exact matches, and rejects cross-tenant edits',async()=>{
 const {env,sql}=setup();const first=await savePromptBatch(env,'org',base);assert.equal(first.saved_combinations,6);assert.equal(sql.prepare('SELECT count(*) AS n FROM prompts').get()?.n,6);await savePromptBatch(env,'org',base);assert.equal(sql.prepare('SELECT count(*) AS n FROM prompts').get()?.n,6);await assert.rejects(savePromptBatch(env,'another',base),/Workspace not found/);
 const source=sql.prepare("SELECT id FROM prompts WHERE engine='gemini' LIMIT 1").get()!;await savePromptBatch(env,'org',{...base,texts:['Updated question?'],engines:['gemini','google'],source_id:source.id});assert.equal(sql.prepare('SELECT engine,text FROM prompts WHERE id=?').get(source.id)?.engine,'gemini');assert.equal(sql.prepare("SELECT count(*) AS n FROM prompts WHERE text='Updated question?'").get()?.n,2);
});
test('bad batch inputs and more than 100 prompt-engine combinations do not partially save',async()=>{
 const {env,sql}=setup();await assert.rejects(savePromptBatch(env,'org',{...base,texts:['valid question','x']}));assert.equal(sql.prepare('SELECT count(*) AS n FROM prompts').get()?.n,0);await assert.rejects(savePromptBatch(env,'org',{...base,texts:Array.from({length:34},(_,i)=>'Question '+i)}),/100/);assert.equal(sql.prepare('SELECT count(*) AS n FROM prompts').get()?.n,0);
});
