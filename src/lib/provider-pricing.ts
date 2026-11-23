// Public published list rates, not a quote or an execution/billing authority.
export const providerPricingCheckedAt = "2026-11-23";
export const llmPricingUrl = "https://dataforseo.com/pricing/ai-optimization/llm-scraper";
export const googlePricingUrl = "https://dataforseo.com/pricing/google-serp/google-organic-serp-api";
export const providerBillingUrl = "https://dataforseo.com/pricing";
export type CollectionMode = "standard" | "priority" | "live";
export type CollectionProfile = "all" | "chatgpt" | "gemini" | "google" | "custom";
export const llmRates = { standard: 0.0012, priority: 0.0024, live: 0.004 };
export const googleBaseRates = { standard: 0.0006, priority: 0.0012, live: 0.002 };
export function profilePricing(profile: Exclude<CollectionProfile, "custom">, mode: CollectionMode) {
  // Depth 10, budget for async AI Overview + poisoned-result resolution (one base charge each).
  // Async surcharge may be refunded; advanced search operators are not included.
  const google = googleBaseRates[mode] * 3;
  const engines = profile === "all" ? 3 : 1;
  const perQuestion = profile === "all" ? 2 * llmRates[mode] + google
    : profile === "google" ? google : llmRates[mode];
  return { engines, perRun: perQuestion / engines, perQuestion };
}
