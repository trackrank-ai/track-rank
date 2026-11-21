import {HttpError, now, one, type Env, type Row} from './types';
export const trialDuration = 14 * 24 * 3600000;
export async function startTrial(env:Env,userId:string,orgId:string){
 if(env.HOSTED_FREE_TRIAL_ENABLED!=='true')throw new HttpError(503,'Free trial enrollment is temporarily unavailable');
 const user=await one(env,'SELECT emailVerified FROM user WHERE id=?',userId);
 if(!user?.emailVerified)throw new HttpError(403,'Verify your email before starting the free trial');
 const assignment=await one<Row>(env,'SELECT plan_version_id FROM organization_plans WHERE org_id=?',orgId);
 if(!assignment || !['pending-v1','trial-v1'].includes(String(assignment.plan_version_id)))throw new HttpError(409,'This organization already has an access plan');
 const previousBilling=await one(env,"SELECT b.org_id FROM billing_customers b JOIN memberships m ON m.org_id=b.org_id WHERE m.user_id=? AND m.role='owner' AND b.trial_used=1 LIMIT 1",userId);
 if(previousBilling)throw new HttpError(409,"Your account has already used its introductory trial");
 const billing=await one(env,"SELECT trial_used FROM billing_customers WHERE org_id=?",orgId);
 if(billing?.trial_used)throw new HttpError(409,"This organization has already used its introductory trial");
 const prior=await one(env,'SELECT org_id FROM account_trial_claims WHERE user_id=?',userId);
 if(prior && prior.org_id!==orgId)throw new HttpError(409,'Your introductory trial has already been used; choose a paid plan for this organization');
 const t=now();
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO account_trial_claims(user_id,org_id,claimed_at) VALUES(?,?,?)').bind(userId,orgId,t),
  env.DB.prepare('INSERT OR IGNORE INTO organization_trials(org_id,started_at,ends_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM account_trial_claims WHERE user_id=? AND org_id=?)').bind(orgId,t,t+trialDuration,userId,orgId),
  env.DB.prepare("UPDATE organization_plans SET plan_version_id='trial-v1',assigned_at=?,reason='Card-free 14-day introductory trial' WHERE org_id=? AND plan_version_id='pending-v1' AND EXISTS(SELECT 1 FROM organization_trials WHERE org_id=?)").bind(t,orgId,orgId),
 ]);
 const trial=await one(env,'SELECT started_at,ends_at FROM organization_trials WHERE org_id=?',orgId);
 if(!trial)throw new HttpError(409,'Your introductory trial has already been used');
 return trial;
}
