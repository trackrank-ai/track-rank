import { z } from "zod";
import { HttpError, now, one, type Env, type Row } from "./types";

export const planLimits = z.object({
  api_per_minute: z.number().int().min(1).max(10000),
  provider_per_minute: z.number().int().min(1).max(10000),
  runs_per_month: z.number().int().min(1).max(1000000),
  searchable_history_days: z.number().int().min(1).max(3650).optional(),
}).strict();
export type PlanLimits = z.infer<typeof planLimits>;
export async function organizationPlan(env: Env, org: string) {
  const row = await one<Row>(env,
    `SELECT p.* FROM organization_plans a JOIN plan_versions p ON p.id=a.plan_version_id WHERE a.org_id=?`, org);
  // Retired versions continue serving assigned customers. Missing/corrupt plans fail closed.
  if (!row) throw new HttpError(503, "Organization plan is not configured");
  if (row.family === "pending")
    throw new HttpError(402, "Choose a plan in billing settings to access this organization");
  if (row.family === "trial") {
    const trial = await one<Row>(env, "SELECT ends_at FROM organization_trials WHERE org_id=?", org);
    if (!trial || Number(trial.ends_at) <= now()) throw new HttpError(402, "Your 14-day free trial has ended. Choose a plan and pay to continue; your data is retained.");
  }
  if (Number(row.price_cents) > 0) {
    // Paid catalog assignments never grant access by themselves, even if billing is disabled.
    const billing = await one<Row>(env, "SELECT status,price_id,risk_hold,updated_at FROM billing_customers WHERE org_id=?", org);
    const mapped = billing && await one<Row>(env, "SELECT plan_version_id FROM billing_prices WHERE price_id=? AND livemode=?", billing.price_id, Number(!env.STRIPE_SECRET_KEY?.includes("_test_")));
    if (env.BILLING_ENABLED !== "true" || !env.STRIPE_SECRET_KEY || billing?.status !== "active" || billing?.risk_hold === 1 || Number(billing?.updated_at) < now() - 24 * 3600000 || mapped?.plan_version_id !== row.id)
      throw new HttpError(402, "Subscription payment required; the organization owner can use billing management");
  }
  let limits: PlanLimits;
  try { limits = planLimits.parse(JSON.parse(String(row.limits_json))); }
  catch { throw new HttpError(503, "Organization plan configuration is invalid"); }
  return { version: String(row.id), family: String(row.family), name: String(row.name),
    price_cents: Number(row.price_cents), currency: String(row.currency), interval: String(row.interval), limits };
}
export async function defaultPlanVersion(env: Env) {
  const version = env.BILLING_ENABLED === "true" ? "pending-v1" : env.DEFAULT_PLAN_VERSION || "beta-v1";
  const row = await one(env, "SELECT id FROM plan_versions WHERE id=? AND status='active'", version);
  if (!row) throw new HttpError(503, "Default plan is not available for new organizations");
  return version;
}
export function calendarMonth(time = now()) {
  const d = new Date(time);
  return { key: d.toISOString().slice(0, 7),
    start: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1),
    end: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) };
}
