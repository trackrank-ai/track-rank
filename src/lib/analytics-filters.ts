import { normalizePromptTag, validPromptTag } from "./prompt-tags";

export const DAY_MS = 86_400_000;
export const utcDay = (time: number) => new Date(time).toISOString().slice(0, 10);
export function validDay(day: string) {
  const time = Date.parse(day);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(time) && utcDay(time) === day;
}
export function defaultPeriod(time = Date.now()) {
  return { from: utcDay(time - 29 * DAY_MS), to: utcDay(time) };
}

export const overlapValues = ["all", "client_only", "competitor_only", "both", "neither"] as const;
export type BrandOverlap = typeof overlapValues[number];

export type AnalyticsScope = {
  set?: string;
  tags?: string;
  engine?: "chatgpt" | "gemini" | "google";
  location?: string;
  from?: string;
  to?: string;
  trackedBrand?: string;
  compareBrand?: string;
  overlap?: BrandOverlap;
  matchFrom?: string;
  matchTo?: string;
};
export const answerMetrics = ["eligible", "coverage", "brand", "mention", "citation", "compare_mention", "compare_citation"] as const;
export type AnswerMetric = typeof answerMetrics[number];
export type TrendMetric = "mention" | "citation";

export function analyticsScope(search: Record<string, unknown>): AnalyticsScope {
  const bounded = (value: unknown, max: number) =>
    typeof value === "string" && value.trim().length <= max ? value.trim() || undefined : undefined;
  const id = (value: unknown) => typeof value === "string" && /^[\w-]{1,100}$/.test(value) ? value : undefined;
  const day = (value: unknown) => typeof value === "string" && validDay(value) ? value : undefined;
  const { engine } = search;
  const tags = bounded(search.tags, 1020)?.split(",").map(normalizePromptTag);
  const trackedBrand = id(search.trackedBrand);
  const compareBrand = id(search.compareBrand);
  const matchFrom = day(search.matchFrom);
  const matchTo = day(search.matchTo);
  const matched = matchFrom && matchTo && matchFrom <= matchTo;
  return {
    matchFrom: matched ? matchFrom : undefined,
    matchTo: matched ? matchTo : undefined,
    set: id(search.set),
    tags: tags && tags.length <= 20 && tags.every(validPromptTag) ? [...new Set(tags)].sort().join(",") : undefined,
    engine: engine === "chatgpt" || engine === "gemini" || engine === "google" ? engine : undefined,
    location: bounded(search.location, 200),
    from: day(search.from),
    to: day(search.to),
    trackedBrand,
    compareBrand: trackedBrand && trackedBrand !== compareBrand ? compareBrand : undefined,
    overlap: trackedBrand && compareBrand && trackedBrand !== compareBrand && overlapValues.includes(search.overlap as BrandOverlap)
      ? search.overlap as BrandOverlap : undefined,
  };
}

export function analyticsQuery(scope: AnalyticsScope, workspace?: string) {
  const query = new URLSearchParams();
  if (workspace && workspace !== "all") query.set("workspace", workspace);
  const apiName: Record<string, string> = { trackedBrand: "tracked_brand", compareBrand: "compare_brand", matchFrom: "match_from", matchTo: "match_to" };
  for (const [key, value] of Object.entries(scope)) {
    if (value) query.set(apiName[key] ?? key, value);
  }
  return query;
}
