import { planLimits } from "./plans";
import { all, type Env } from "./types";

type OfferRow = {
  offer_key: string;
  price_id: string;
  name: string;
  price_cents: number;
  currency: string;
  interval: "month" | "year";
  limits_json: string;
};

export async function billingOffers(env: Env) {
  if (env.BILLING_ENABLED !== "true" || !env.STRIPE_SECRET_KEY) return [];
  return all<OfferRow>(env, `
    SELECT o.offer_key,o.price_id,p.name,p.price_cents,p.currency,p.interval,p.limits_json
    FROM billing_offers o
    JOIN billing_prices b ON b.price_id=o.price_id AND b.livemode=o.livemode
    JOIN plan_versions p ON p.id=b.plan_version_id
    WHERE o.livemode=? AND p.status='active' AND p.price_cents>0
    ORDER BY p.price_cents,o.offer_key LIMIT 100
  `, Number(!env.STRIPE_SECRET_KEY.includes("_test_")));
}

export function publicBillingOffers(offers: Awaited<ReturnType<typeof billingOffers>>) {
  return offers.map(({ offer_key, name, price_cents, currency, interval, limits_json }) => ({
    offer_key, name, price_cents, currency, interval,
    limits: planLimits.parse(JSON.parse(limits_json)),
  }));
}
