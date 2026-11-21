import type {
  D1Database,
  R2Bucket,
  ExecutionContext,
  Workflow,
} from "@cloudflare/workers-types";
export type Env = {
  MAINTENANCE_MODE?: string;
  MAINTENANCE_SINCE?: string;
  OPERATIONS_TOKEN?: string;
  RECOVERY_PUBLIC_KEY?: string;
  BACKUPS?: R2Bucket;
  BILLING_TAX_REVIEWED?: string;
  BILLING_ENABLED?: string;
  BILLING_CHECKOUT_ENABLED?: string;
  BILLING_ALERT_EMAIL?: string;
  BILLING_RECONCILE_BATCH?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_AUTOMATIC_TAX?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_STARTER_PRICE_ID?: string;
  STRIPE_PORTAL_CONFIGURATION?: string;
  DEFAULT_PLAN_VERSION?: string;
  API_REQUESTS_PER_MINUTE?: string;
  PROVIDER_REQUESTS_PER_MINUTE?: string;
  DB: D1Database;
  RUN_WORKFLOW: Workflow<{ runId: string }>;
  ANSWERS: R2Bucket;
  AUTH_SECRET: string;
  CREDENTIALS_KEY: string;
  BASE_URL: string;
  PUBLIC_OPERATOR_NAME?: string;
  PUBLIC_SUPPORT_EMAIL?: string;
  SIGNUP_ENABLED?: string;
  DEV_SKIP_EMAIL_VERIFICATION?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
};
export type Ctx = ExecutionContext;
export type Principal = {
  userId: string;
  orgId?: string;
  role?: string;
  scopes?: string[];
  keyId?: string;
};
export type Row = Record<string, unknown>;
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public headers: Record<string, string> = {},
  ) {
    super(message);
  }
}
export const uuid = () => crypto.randomUUID();
export const now = () => Date.now();
export const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function one<T = Row>(env: Env, sql: string, ...args: unknown[]) {
  return env.DB.prepare(sql)
    .bind(...args)
    .first<T>();
}
export async function all<T = Row>(env: Env, sql: string, ...args: unknown[]) {
  return (
    await env.DB.prepare(sql)
      .bind(...args)
      .all<T>()
  ).results;
}
export async function exec(env: Env, sql: string, ...args: unknown[]) {
  return env.DB.prepare(sql)
    .bind(...args)
    .run();
}
export const required = <T>(
  v: T | null | undefined,
  message = "Not found",
): T => {
  if (v == null) throw new HttpError(404, message);
  return v;
};
