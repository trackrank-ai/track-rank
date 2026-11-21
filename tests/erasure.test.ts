import {test} from 'node:test';import assert from 'node:assert/strict';
import {eraseData} from '../src/server/erasure';import {fixture} from './helpers/billing-fixture';
function setup(){const f=fixture();f.sql.exec(`
 INSERT INTO user VALUES('owner','Owner','owner@example.invalid',1,NULL,0,0);
 INSERT INTO memberships VALUES('org','owner','owner',0);
 INSERT INTO brands VALUES('brand','org','Brand','','[]','own',0);
 INSERT INTO workspaces VALUES('space','org','Workspace','brand',0);
 INSERT INTO workspace_brands VALUES('org','space','brand','own');
 INSERT INTO prompts(id,org_id,workspace_id,brand_id,text,created_at,updated_at) VALUES('prompt','org','space','brand','Question',0,0);
 INSERT INTO runs(id,org_id,prompt_id,workspace_id,prompt_text,config,status,idempotency_key,created_at,updated_at) VALUES('run','org','prompt','space','Question','{}','succeeded','unique',0,0);
 INSERT INTO credentials VALUES('org','ciphertext-fixture',1,0);
 INSERT INTO schedules VALUES('schedule','org','prompt','daily','[1]','10:00','UTC',0,NULL,0);
 INSERT INTO api_keys(id,org_id,user_id,name,prefix,token_hash,scopes,expires_at,created_at) VALUES('key','org','owner','Key','trk','hash','[]',1,0);
 INSERT INTO usage_daily VALUES('org','2026-11-21',1);
 INSERT INTO monthly_api_usage VALUES('org','2026-11',1);
 INSERT INTO audit_log VALUES('audit','org','owner','read',NULL,0);
 `);Object.assign(f.env,{MAINTENANCE_MODE:'true',MAINTENANCE_SINCE:String(Date.now()-11*60000),BILLING_ENABLED:'false'});const objects=new Map([['org/answer.json','private'],['other/keep.json','other']]);let fail=false;Object.assign(f.env,{ANSWERS:{list:async({prefix}:{prefix:string})=>({objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false}),delete:async(keys:string[])=>{if(fail)throw Error('R2 unavailable');for(const k of keys)objects.delete(k);}}});return {...f,objects,setFail:(value:boolean)=>{fail=value}};}
test('erasure rejects live app, invalid maintenance timestamp, active work and active billing',async()=>{
 const {env,sql}=setup();env.MAINTENANCE_MODE='false';await assert.rejects(eraseData(env,{kind:'organization',id:'org'}),/maintenance/);env.MAINTENANCE_MODE='true';env.MAINTENANCE_SINCE='invalid';await assert.rejects(eraseData(env,{kind:'organization',id:'org'}),/maintenance/);env.MAINTENANCE_SINCE=String(Date.now()-11*60000);sql.exec("UPDATE runs SET status='uncertain'");await assert.rejects(eraseData(env,{kind:'organization',id:'org'}),/provider tasks/);sql.exec("UPDATE runs SET status='succeeded'");sql.exec("UPDATE billing_customers SET status='trialing'");await assert.rejects(eraseData(env,{kind:'organization',id:'org'}),/Cancel billing/);
});
test('organization preview is non-destructive; R2 failure preserves SQL inventory; retry erases one tenant only',async()=>{
 const {env,sql,objects,setFail}=setup();sql.exec("INSERT INTO organizations(id,name,created_at) VALUES('other','Other tenant',0)");
 const dry=await eraseData(env,{kind:'organization',id:'org'});assert.equal(dry.dry_run,true);assert.equal(objects.size,2);
 setFail(true);await assert.rejects(eraseData(env,{kind:'organization',id:'org',confirm:'erase:organization:org'}),/R2 unavailable/);assert.ok(sql.prepare("SELECT id FROM organizations WHERE id='org'").get());
 setFail(false);const done=await eraseData(env,{kind:'organization',id:'org',confirm:'erase:organization:org'});assert.equal(done.erased,true);assert.deepEqual([...objects.keys()],['other/keep.json']);assert.equal(sql.prepare("SELECT count(*) AS n FROM organizations WHERE id='org'").get()?.n,0);assert.equal(sql.prepare("SELECT count(*) AS n FROM billing_customers WHERE org_id='org'").get()?.n,0);assert.ok(sql.prepare("SELECT id FROM organizations WHERE id='other'").get());assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
});
test('account erasure refuses unresolved memberships then removes auth and verification records',async()=>{
 const {env,sql}=setup();sql.exec("INSERT INTO user VALUES('person','Person','test@example.invalid',1,NULL,0,0);INSERT INTO memberships VALUES('org','person','owner',0);INSERT INTO session VALUES('sess',1,'token',0,0,NULL,NULL,'person');INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt) VALUES('acct','person','credential','person',0,0);INSERT INTO verification VALUES('verify','test@example.invalid','token',0,0,0)");
 await assert.rejects(eraseData(env,{kind:'account',id:'person',confirm:'erase:account:person'}),/memberships/);sql.exec("DELETE FROM memberships WHERE user_id='person'");await eraseData(env,{kind:'account',id:'person',confirm:'erase:account:person'});assert.equal(sql.prepare("SELECT count(*) AS n FROM user WHERE id='person'").get()?.n,0);for(const table of ['session','account','verification'])assert.equal(sql.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n,0);
});
