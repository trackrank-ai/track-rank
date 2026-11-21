export type PricedPlan = {
  name: string; price_cents: number; currency: string; interval: string;
  limits: { runs_per_month: number; searchable_history_days?: number };
};
export const REPOSITORY_URL = "https://github.com/trackrank-ai/track-rank";
// Official published monthly brand plans; reviewed 2026-11-21.
export const PEEC_PLANS = [
  { name: "Starter", prompts: 50, price: 95 },
  { name: "Pro", prompts: 150, price: 245 },
  { name: "Advanced", prompts: 350, price: 495 },
];
export function estimatePricing(plans: PricedPlan[], prompts: number, engines: number, dailySamples: number, historyDays: number, providerPerRun: number) {
  const values = [prompts, engines, dailySamples, historyDays, providerPerRun];
  if (values.some(v => !Number.isFinite(v) || v < 0) || [prompts, engines, dailySamples, historyDays].some(v => !Number.isInteger(v) || v < 1)) return null;
  const runs = prompts * engines * dailySamples * 30;
  const plan = plans.filter(p => p.currency === "usd" && p.interval === "month" && p.limits.runs_per_month >= runs && (p.limits.searchable_history_days ?? 0) >= historyDays)
    .sort((a,b) => a.price_cents-b.price_cents)[0];
  const provider = runs * providerPerRun;
  // Peec published packages are daily tracking on three models. No extrapolated price for unsupported configurations.
  const alternative = engines === 3 && dailySamples === 1 ? PEEC_PLANS.find(p => p.prompts >= prompts) : undefined;
  const total = plan ? plan.price_cents / 100 + provider : null;
  return { runs, plan, provider, total, alternative, savings: total !== null && alternative ? alternative.price - total : null };
}
