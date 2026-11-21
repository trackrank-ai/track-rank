import { z } from "zod";
import { all, HttpError, now, one, type Env, type Principal, type Row } from "./types";

export async function billingAccount(env: Env, org: string) {
  const account = await one<Row>(env, "SELECT * FROM billing_accounts WHERE org_id=?", org);
  if (!account) throw new HttpError(503, "Billing account is not configured");
  return account;
}

export async function canManageBilling(env: Env, p: Principal) {
  // Recheck actual membership rather than trusting a caller-supplied role.
  const member = await one<Row>(env, "SELECT role FROM memberships WHERE org_id=? AND user_id=?", p.orgId, p.userId);
  if (!member) return false;
  if (member.role === "owner") return true;
  return !!await one(env, `SELECT 1 FROM billing_account_admins a JOIN billing_accounts b ON b.id=a.billing_account_id
    WHERE b.org_id=? AND a.org_id=b.org_id AND a.user_id=?`, p.orgId, p.userId);
}

export const billingAdminUpdate = z.object({
  user_ids: z.array(z.string().min(1).max(100)).min(1).max(100),
  action: z.enum(["grant", "revoke"]),
}).strict();

export async function updateBillingAdmins(env: Env, p: Principal, input: z.infer<typeof billingAdminUpdate>) {
  if (p.keyId || !await one(env, "SELECT 1 FROM memberships WHERE org_id=? AND user_id=? AND role='owner'", p.orgId, p.userId))
    throw new HttpError(403, "An organization owner session is required to delegate billing");
  const account = await billingAccount(env, p.orgId!);
  const ids = [...new Set(input.user_ids)];
  const placeholders = ids.map(() => "?").join(",");
  const members = await all<Row>(env, `SELECT user_id,role FROM memberships WHERE org_id=? AND user_id IN (${placeholders})`, p.orgId, ...ids);
  if (members.length !== ids.length) throw new HttpError(404, "One or more members were not found in this organization");
  if (members.some(m => m.role === "owner")) throw new HttpError(409, "Owners always have billing access");
  const statements = ids.map(user => input.action === "grant"
    ? env.DB.prepare(`INSERT INTO billing_account_admins(billing_account_id,org_id,user_id,granted_by,granted_at)
        SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM memberships WHERE org_id=? AND user_id=? AND role='owner')
        ON CONFLICT(billing_account_id,user_id) DO NOTHING`).bind(account.id, p.orgId, user, p.userId, now(), p.orgId, p.userId)
    : env.DB.prepare(`DELETE FROM billing_account_admins WHERE billing_account_id=? AND user_id=?
        AND EXISTS(SELECT 1 FROM memberships WHERE org_id=? AND user_id=? AND role='owner')`).bind(account.id, user, p.orgId, p.userId));
  statements.push(env.DB.prepare("INSERT INTO audit_log(id,org_id,actor_id,action,resource_id,created_at) VALUES(?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), p.orgId, p.userId, "billing_admin." + input.action, JSON.stringify(ids), now()));
  await env.DB.batch(statements);
  return { updated: ids.length };
}
