import { hashToken } from "./crypto";
import { defaultPlanVersion } from "./plans";
import { trialEnrollment } from "./trials";
import { HttpError, now, one, uuid, type Env } from "./types";

export async function createOrganization(env: Env, userId: string, name?: string) {
  const signupTrial = name === undefined;
  const hosted = env.BILLING_ENABLED === "true";
  if (signupTrial && !hosted) throw new HttpError(503, "Hosted billing is not enabled");
  if (hosted) {
    const user = await one<{ name: string; emailVerified: number }>(env, "SELECT name,emailVerified FROM user WHERE id=?", userId);
    if (!user?.emailVerified) throw new HttpError(403, "Verify your email before creating a hosted organization");
    name ??= `${user.name || "My"}'s organization`.slice(0, 100);
  }

  const org = signupTrial ? "trial_" + await hashToken(userId) : uuid();
  const workspace = signupTrial ? org + "_default" : uuid();
  const time = now();
  const plan = await defaultPlanVersion(env);
  const [created] = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO organizations(id,name,created_at)
      SELECT ?,?,? WHERE ?=0 OR NOT EXISTS(SELECT 1 FROM account_trial_claims WHERE user_id=?)
      ON CONFLICT(id) DO NOTHING
    `).bind(org, name, time, Number(signupTrial), userId),
    env.DB.prepare(`
      INSERT INTO organization_plans(org_id,plan_version_id,assigned_at,reason)
      SELECT ?,?,?,'New organization' WHERE EXISTS(SELECT 1 FROM organizations WHERE id=?)
      ON CONFLICT(org_id) DO NOTHING
    `).bind(org, plan, time, org),
    env.DB.prepare(`
      INSERT INTO memberships(org_id,user_id,role,created_at)
      SELECT ?,?,'owner',? WHERE EXISTS(SELECT 1 FROM organizations WHERE id=?)
      ON CONFLICT(org_id,user_id) DO NOTHING
    `).bind(org, userId, time, org),
    env.DB.prepare(`
      INSERT INTO workspaces(id,org_id,name,created_at)
      SELECT ?,?,'Default workspace',? WHERE EXISTS(SELECT 1 FROM organizations WHERE id=?)
      ON CONFLICT(id) DO NOTHING
    `).bind(workspace, org, time, org),
    ...(hosted ? trialEnrollment(env, userId, org, time) : []),
  ]);

  if (!signupTrial) return { id: org, workspace_id: workspace, created: true };
  const claim = await one<{ org_id: string }>(env, `
    SELECT c.org_id FROM account_trial_claims c
    JOIN memberships m ON m.org_id=c.org_id AND m.user_id=c.user_id
    WHERE c.user_id=?
  `, userId);
  if (!claim) throw new HttpError(409, "Your introductory trial has already been used");
  return { id: claim.org_id, created: (created.meta.changes ?? 0) > 0 };
}
