import { estimatePricing, type PricedPlan } from "./pricing-estimate";
import { profilePricing, type CollectionProfile, type CollectionMode } from "./provider-pricing";

export type CostExample = { questions: number; profile?: Exclude<CollectionProfile, "custom">; historyDays?: number };
export function comparisonCost(plans: PricedPlan[], example: CostExample) {
  const profile = example.profile ?? "all";
  const mode = (mode: CollectionMode) => {
    const rates = profilePricing(profile, mode);
    return estimatePricing(plans, example.questions, rates.engines, 1, example.historyDays ?? 30, rates.perRun)!;
  };
  return { standard: mode("standard"), priority: mode("priority"), live: mode("live"),
    questions: example.questions, profile, engines: profilePricing(profile, "standard").engines };
}
