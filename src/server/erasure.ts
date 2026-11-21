// Operator-only erasure, never callable by customer accounts.
// Requires application-wide maintenance and an independently verified support request.
import { all, one, HttpError, now, type Env } from './types';
import { workflowId } from './dispatch';
export function maintenance(env: Env) { return env.MAINTENANCE_MODE === 'true'; }
export async function eraseData(env: Env, data: {kind?:string; id?:string; confirm?:string}) {
  if (!maintenance(env) || !env.MAINTENANCE_SINCE || !Number.isFinite(Number(env.MAINTENANCE_SINCE)) || now()-Number(env.MAINTENANCE_SINCE)<10*60*1000 || Number(env.MAINTENANCE_SINCE)>now()) throw new HttpError(409,'Enable maintenance for at least 10 minutes and drain workflows before erasure');
  if (!data.id || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.id) || !['organization','account'].includes(data.kind||'')) throw new HttpError(400,'Valid erasure kind and identifier required');
  const id=data.id;
  if (data.kind==='account') {
    const user=await one<{email:string}>(env,'SELECT email FROM user WHERE id=?',id);
    if (!user) throw new HttpError(404,'Account not found');
    const memberships=await all(env,'SELECT org_id,role FROM memberships WHERE user_id=?',id);
    if(memberships.length) throw new HttpError(409,'Transfer or erase owned organizations and remove other memberships before account erasure');
    if(data.confirm!==`erase:account:${id}`)return {dry_run:true,kind:data.kind,id,auth_records_will_be_erased:true,shared_organizations_untouched:true};
    await env.DB.batch([
      env.DB.prepare('DELETE FROM invites WHERE created_by=?').bind(id),
      env.DB.prepare('UPDATE invites SET claimed_by=NULL WHERE claimed_by=?').bind(id),
      env.DB.prepare('DELETE FROM verification WHERE identifier=? OR value=?').bind(user.email,id),
      env.DB.prepare('DELETE FROM user WHERE id=?').bind(id),
    ]);
    return {erased:true,kind:data.kind,id};
  }
  if(!await one(env,'SELECT id FROM organizations WHERE id=?',id))throw new HttpError(404,'Organization not found');
  const busy=await one<{n:number}>(env,"SELECT count(*) AS n FROM runs WHERE org_id=? AND status IN ('submitting','submitted','uncertain')",id);
  if(busy?.n)throw new HttpError(409,'Resolve provider tasks and terminate/drain workflows before erasure');
  for (const run of await all(env,'SELECT id,workflow_generation FROM runs WHERE org_id=? AND workflow_started=1',id)) {
    const instance=await env.RUN_WORKFLOW.get(workflowId(String(run.id), Number(run.workflow_generation)));
    const state=await instance.status();
    if(!['complete','errored','terminated'].includes(state.status))throw new HttpError(409,'Terminate all organization Workflow instances before erasure');
  }
  const billing=await one<{customer_id:string;subscription_id:string|null;status:string}>(env,'SELECT customer_id,subscription_id,status FROM billing_customers WHERE org_id=?',id);
  if(billing && !['none','canceled','incomplete_expired'].includes(billing.status))throw new HttpError(409,'Cancel billing and reconcile before erasure');
  if(billing?.customer_id && env.BILLING_ENABLED==='true') {
    // Avoid a new Checkout reopening billing after local erasure. Cancel/expire in Stripe first.
    const {stripeClient}=await import('./billing');const stripe=stripeClient(env);
    const subscriptions=await stripe.subscriptions.list({customer:billing.customer_id,status:'all',limit:100});
    const sessions=await stripe.checkout.sessions.list({customer:billing.customer_id,limit:100});
    if(subscriptions.has_more || sessions.has_more || subscriptions.data.some(s=>!['canceled','incomplete_expired'].includes(s.status)) || sessions.data.some(s=>s.status==='open'))throw new HttpError(409,'Stripe still has live subscriptions, open checkouts or unreviewed pagination');
  }
  const counts=await one(env,'SELECT (SELECT count(*) FROM runs WHERE org_id=?) AS runs,(SELECT count(*) FROM memberships WHERE org_id=?) AS memberships',id,id);
  if(data.confirm!==`erase:organization:${id}`)return {dry_run:true,kind:data.kind,id,counts,object_prefix:id+'/',stripe_records_retained:!!billing};
  // R2 first: retry is safe. Keep the D1 inventory until all object pages have gone.
  let cursor:string|undefined;let removed=0;
  do {
    const page=await env.ANSWERS.list({prefix:id+'/',limit:1000,cursor});
    if(page.objects.length)await env.ANSWERS.delete(page.objects.map(o=>o.key));
    removed+=page.objects.length;cursor=page.truncated?page.cursor:undefined;
  }while(cursor);
  if((await env.ANSWERS.list({prefix:id+'/',limit:1})).objects.length)throw new HttpError(409,'Answer objects remain; retry after draining work');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM runs WHERE org_id=?').bind(id),
    env.DB.prepare('DELETE FROM prompts WHERE org_id=?').bind(id),
    env.DB.prepare('DELETE FROM workspace_brands WHERE org_id=?').bind(id),
    env.DB.prepare('DELETE FROM workspaces WHERE org_id=?').bind(id),
    ...(billing?[env.DB.prepare('DELETE FROM billing_sync_locks WHERE customer_id=?').bind(billing.customer_id)]:[]),
    env.DB.prepare('DELETE FROM organizations WHERE id=?').bind(id),
  ]);
  return {erased:true,kind:data.kind,id,answer_objects_removed:removed,stripe_records_retained:!!billing};
}
