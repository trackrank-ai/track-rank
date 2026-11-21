import { monthlyApiLimit, organizationPlan } from "./plans";
import { HttpError, now, one, type Env } from "./types";

export function requestLimit(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 && n <= 10000 ? n : fallback;
}

// D1's atomic upsert serializes concurrent requests across Worker instances.
// Minute buckets match scheduler cleanup; no isolate-local counters or extra services.
export async function enforceLimit(env: Env, key: string, limit: number) {
  const time = now();
  const bucket = Math.floor(time / 60000);
  const row = await one<{ count: number }>(env,
    `INSERT INTO request_limits(key,bucket,count) VALUES(?,?,1)
     ON CONFLICT(key,bucket) DO UPDATE SET count=MIN(count+1,?) RETURNING count`,
    key, bucket, limit + 1,
  );
  if (!row) throw new HttpError(503, "Request limiter unavailable");
  if (row.count > limit) {
    const retry = Math.max(1, Math.ceil(((bucket + 1) * 60000 - time) / 1000));
    throw new HttpError(429, "Customer rate limit exceeded; retry after the indicated delay", {
      "Retry-After": String(retry),
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String((bucket + 1) * 60),
    });
  }
}

// Optional deployment overrides are emergency CEILINGS, never plan upgrades.
export function safetyCeiling(value: string | undefined, allowance: number) {
  return Math.min(allowance, requestLimit(value, allowance));
}
export async function customerLimit(env: Env, org: string, expensive = false) {
  const { limits } = await organizationPlan(env, org);
  await enforceLimit(env, `customer:${org}`, safetyCeiling(env.API_REQUESTS_PER_MINUTE, limits.api_per_minute));
  await monthlyApiLimit(env, org, limits.api_per_month);
  if (expensive)
    await enforceLimit(env, `provider:${org}`, safetyCeiling(env.PROVIDER_REQUESTS_PER_MINUTE, limits.provider_per_minute));
}
