import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
const limitSchema = z.object({
  api_per_minute: z.number().int().min(1).max(10000),
  api_per_month: z.number().int().min(1).max(1000000000),
  provider_per_minute: z.number().int().min(1).max(10000),
  runs_per_month: z.number().int().min(1).max(1000000),
  concurrent_runs: z.number().int().min(1).max(100),
}).strict();
export const revisionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
  family: z.string().min(1).max(80), name: z.string().min(1).max(100),
  price_cents: z.number().int().min(0), currency: z.string().regex(/^[a-z]{3}$/),
  interval: z.enum(['month','year']), limits: limitSchema,
}).strict();
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const offerKey = z.string().max(64).regex(/^[a-z0-9][a-z0-9-]*$/);
const stripePrice = z.string().max(100).regex(/^price_[a-zA-Z0-9]+$/);
const stripeMode = z.enum(['test', 'live']).transform(mode => Number(mode === 'live'));
export function planSql(action, args) {
  if (action === 'list') return 'SELECT * FROM plan_versions ORDER BY family,created_at,id;';
  if (action === 'create') {
    const p = revisionSchema.parse(JSON.parse(readFileSync(args[0], 'utf8')));
    return `INSERT INTO plan_versions(id,family,name,price_cents,currency,interval,status,limits_json,created_at) VALUES(${[p.id,p.family,p.name].map(quote).join(',')},${p.price_cents},${quote(p.currency)},${quote(p.interval)},'draft',${quote(JSON.stringify(p.limits))},${Date.now()});`;
  }
  if (['activate','retire'].includes(action) && args[0])
    return `UPDATE plan_versions SET status=${quote(action === 'activate' ? 'active' : 'retired')} WHERE id=${quote(args[0])} RETURNING id,status;`;
  if (action === 'assign' && args[0] && args[1] && args[2])
    return `INSERT INTO organization_plans(org_id,plan_version_id,assigned_at,reason) VALUES(${quote(args[0])},${quote(args[1])},${Date.now()},${quote(args[2])}) ON CONFLICT(org_id) DO UPDATE SET plan_version_id=excluded.plan_version_id,assigned_at=excluded.assigned_at,reason=excluded.reason RETURNING *;`;
  if (action === 'offer-list')
    return 'SELECT o.offer_key,o.livemode,b.price_id,b.plan_version_id,p.status FROM billing_offers o JOIN billing_prices b ON b.price_id=o.price_id JOIN plan_versions p ON p.id=b.plan_version_id ORDER BY o.livemode,o.offer_key;';
  if (action === 'price-map') {
    const [price, revision, mode] = z.tuple([stripePrice, revisionSchema.shape.id, stripeMode]).parse(args);
    return `INSERT INTO billing_prices(price_id,plan_version_id,livemode) VALUES(${quote(price)},${quote(revision)},${mode}) ON CONFLICT(price_id) DO UPDATE SET plan_version_id=excluded.plan_version_id,livemode=excluded.livemode RETURNING *;`;
  }
  if (action === 'offer-publish') {
    const [offer, price, mode] = z.tuple([offerKey, stripePrice, stripeMode]).parse(args);
    return `INSERT INTO billing_offers(offer_key,livemode,price_id) VALUES(${quote(offer)},${mode},(SELECT b.price_id FROM billing_prices b JOIN plan_versions p ON p.id=b.plan_version_id WHERE b.price_id=${quote(price)} AND b.livemode=${mode} AND p.status='active' AND p.price_cents>0)) ON CONFLICT(offer_key,livemode) DO UPDATE SET price_id=excluded.price_id RETURNING *;`;
  }
  if (action === 'offer-withdraw') {
    const [offer, mode] = z.tuple([offerKey, stripeMode]).parse(args);
    return `DELETE FROM billing_offers WHERE offer_key=${quote(offer)} AND livemode=${mode} RETURNING *;`;
  }
  throw new Error('Usage: npm run plans -- list | create <json-file> | activate <version> | retire <version> | assign <org> <version> <reason> | offer-list | price-map <price> <version> <test|live> | offer-publish <key> <price> <test|live> | offer-withdraw <key> <test|live> [--apply] [--remote --config <file>]');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let dir;
  try {
    const args = process.argv.slice(2);
    const take = flag => { const i = args.indexOf(flag); if (i < 0) return false; args.splice(i,1); return true; };
    const apply = take('--apply'), remote = take('--remote');
    const ci = args.indexOf('--config');
    const config = ci >= 0 ? args.splice(ci,2)[1] : undefined;
    if (remote && !config) throw new Error('--remote requires an explicit --config file');
    const sql = planSql(args.shift(), args);
    if (!apply) { console.log(sql); console.log('\n-- Preview only. Add --apply to execute (local by default).'); }
    else {
      dir = mkdtempSync(join(tmpdir(), 'trackrank-plans-'));
      const file = join(dir,'operation.sql'); writeFileSync(file,sql,{mode:0o600});
      execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js','d1','execute','DB',remote ? '--remote' : '--local','--config',config || 'wrangler.local.jsonc','--file',file], {stdio:'inherit'});
    }
  } catch (e) { console.error(e.message); process.exitCode=1; }
  finally { if (dir) rmSync(dir,{recursive:true}); }
}
