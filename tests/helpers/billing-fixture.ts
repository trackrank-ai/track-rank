import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import type { Env } from "../../src/server/types";
export function fixture() {
 const sql = new DatabaseSync(':memory:');
 for (const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort()) sql.exec(readFileSync('migrations/'+f,'utf8'));
 sql.exec(`INSERT INTO organizations(id,name,created_at) VALUES('org','Test',0);
 INSERT INTO organization_plans VALUES('org','beta-v1',0,'fixture');
 INSERT INTO billing_customers(org_id,customer_id,updated_at) VALUES('org','cus_test',0);
 INSERT INTO billing_prices VALUES('price_test','starter-v1',0);`);
 const prepare=(query:string,args:any[]=[])=>({bind:(...a:any[])=>prepare(query,a), first:async()=>sql.prepare(query).get(...args)||null, all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})});
 const env={DB:{prepare,batch:async(stmts:any[])=>{sql.exec('BEGIN');try {const result=[];for(const s of stmts)result.push(await s.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}},BASE_URL:'https://example.test',BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture'} as unknown as Env;
 return {sql,env};
}
