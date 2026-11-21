import type { Env } from "./types";

export const trialDuration = 14 * 24 * 60 * 60 * 1000;

export function trialEnrollment(env: Env, userId: string, orgId: string, time: number) {
  return [
    env.DB.prepare(`
      INSERT INTO account_trial_claims(user_id,org_id,claimed_at)
      SELECT ?,?,? WHERE EXISTS(
        SELECT 1 FROM organization_plans WHERE org_id=? AND plan_version_id='pending-v1'
      ) ON CONFLICT DO NOTHING
    `).bind(userId, orgId, time, orgId),
    env.DB.prepare(`
      INSERT INTO organization_trials(org_id,started_at,ends_at)
      SELECT ?,?,? WHERE EXISTS(
        SELECT 1 FROM account_trial_claims WHERE user_id=? AND org_id=?
      ) ON CONFLICT(org_id) DO NOTHING
    `).bind(orgId, time, time + trialDuration, userId, orgId),
    env.DB.prepare(`
      UPDATE organization_plans SET plan_version_id='trial-v2',assigned_at=?,reason='Card-free 14-day introductory trial'
      WHERE org_id=? AND plan_version_id='pending-v1'
        AND EXISTS(SELECT 1 FROM organization_trials WHERE org_id=?)
    `).bind(time, orgId, orgId),
  ];
}
