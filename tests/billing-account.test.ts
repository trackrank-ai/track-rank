import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers/billing-fixture";
import { api } from "../src/server/api";
import { billingAccount, canManageBilling } from "../src/server/billing-account";
import { hashToken } from "../src/server/crypto";
import { mcp } from "../src/server/mcp";

function setup() {
  const f = fixture();
  f.sql.exec(`INSERT INTO user VALUES('finance','Finance','finance@example.test',1,NULL,0,0),('foreign','Foreign','foreign@example.test',1,NULL,0,0);
    INSERT INTO organizations(id,name,created_at) VALUES('other','Other',0);
    INSERT INTO memberships VALUES('org','finance','viewer',0),('other','foreign','owner',0);`);
  const call = (path: string, user = "alice", data?: unknown) => api(new Request("https://example.test/api/v1" + path, {
    method: data ? "PATCH" : "GET", headers: {"Content-Type":"application/json"}, body: data ? JSON.stringify(data) : undefined,
  }), f.env, {waitUntil(){}} as any, {userId:user, orgId:"org"});
  return {...f, call};
}

test("billing accounts are organization-owned, unique and independent of membership changes", async () => {
  const {sql,env,call} = setup();
  const original=await billingAccount(env,"org");
  const other=await billingAccount(env,"other");
  assert.notEqual(original.id,other.id);
  assert.throws(()=>sql.prepare("INSERT INTO billing_accounts(org_id) VALUES('org')").run(),/UNIQUE/);
  await call("/billing/admins","alice",{user_ids:["finance"],action:"grant"});
  assert.equal(await canManageBilling(env,{userId:"finance",orgId:"org"}),true);
  assert.equal(sql.prepare("SELECT role FROM memberships WHERE user_id='finance'").get()?.role,"viewer");
  sql.exec("DELETE FROM memberships WHERE org_id='org' AND user_id='alice'");
  const after=await billingAccount(env,"org");
  assert.equal(after.id,original.id);
  assert.equal(after.customer_id,"cus_test");
  sql.exec("DELETE FROM memberships WHERE org_id='org' AND user_id='finance'");
  assert.equal(await canManageBilling(env,{userId:"finance",orgId:"org"}),false);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM billing_account_admins").get()?.n,0);
});

test("billing delegation is owner-only, bulk atomic and tenant-scoped, including while unpaid", async () => {
  const {sql,env,call}=setup();
  sql.exec("UPDATE organization_plans SET plan_version_id='pending-v1' WHERE org_id='org'");
  await assert.rejects(call("/billing/admins","alice",{user_ids:["finance","foreign"],action:"grant"}),{status:404});
  assert.equal(await canManageBilling(env,{userId:"finance",orgId:"org"}),false);
  await assert.rejects(call("/billing/admins","finance",{user_ids:["finance"],action:"grant"}),{status:403});
  assert.equal((await call("/billing/admins","alice",{user_ids:["finance"],action:"grant"})).status,200);
  const billing=await (await call("/billing","finance")).json() as any;
  assert.equal(billing.can_manage_billing,true);
  assert.equal(billing.access_status,"choose_plan");
  assert.equal((await call("/billing/handoff","finance")).status,200);
  await assert.rejects(call("/billing/admin-handoff","finance"),{status:403});
  await assert.rejects(call("/workspaces","finance"),{status:402});
  await call("/billing/admins","alice",{user_ids:["finance"],action:"revoke"});
  await assert.rejects(call("/billing/handoff","finance"),{status:403});
  assert.equal(sql.prepare("SELECT count(*) AS n FROM audit_log WHERE action LIKE 'billing_admin.%'").get()?.n,2);
});

test("MCP billing recovery uses a verified app handoff, never Stripe bearer sessions or permission mutations", async () => {
  const {sql,env}=setup();
  sql.exec("UPDATE organization_plans SET plan_version_id='pending-v1' WHERE org_id='org'");
  const key="trk_billing_account_fixture";
  sql.prepare(`INSERT INTO api_keys(id,org_id,user_id,name,prefix,token_hash,scopes,expires_at,created_at)
    VALUES('billing-key','org','alice','Agent','trk',?,'["read","write"]',?,0)`).run(await hashToken(key),Date.now()+60000);
  async function invoke(name:string) {
    const req=new Request("https://example.test/mcp",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json",Accept:"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:{}}})});
    return (await (await mcp(req,env,{waitUntil(){}} as any)).json() as any).result;
  }
  const billing=await invoke("get_billing");
  assert.equal(billing.isError,false);
  assert.equal(JSON.parse(billing.content[0].text).access_status,"choose_plan");
  const handoff=JSON.parse((await invoke("billing_admin_handoff")).content[0].text);
  assert.equal(handoff.requires_interactive_session,true);
  assert.equal(new URL(handoff.url).origin,env.BASE_URL);
  assert.equal(new URL(handoff.url).searchParams.get("org"),"org");
  assert.equal((await invoke("get_context")).isError,true);
  await assert.rejects(api(new Request("https://example.test/api/v1/billing/admins",{method:"PATCH",body:JSON.stringify({user_ids:["finance"],action:"grant"})}),env,{waitUntil(){}} as any,{userId:"alice",orgId:"org",keyId:"billing-key",scopes:["read","write"]}),{status:403});
});
