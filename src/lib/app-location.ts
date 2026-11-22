import { analyticsScope, type AnalyticsScope, type AnswerMetric } from "./analytics-filters";
import { normalizePromptTag, validPromptTag } from "./prompt-tags";

const appTabs = ["overview", "prompts", "research", "runs", "brands", "schedules", "team", "settings", "agents", "workspaces"] as const;
export type AppTab = typeof appTabs[number];
export type ResearchType = "domain" | "page" | "query";

export type AppSearch = AnalyticsScope & {
  metric?: AnswerMetric;
  org?: string;
  workspace?: string;
  tab?: AppTab;
  prompt?: string;
  tag?: string;
  run?: string;
  runPrompt?: string;
  researchType?: ResearchType;
  researchValue?: string;
  trial?: "start";
};

function resourceId(value: unknown) {
  return typeof value === "string" && /^[\w-]{1,100}$/.test(value) ? value : undefined;
}

export function parseAppSearch(search: Record<string, unknown>): AppSearch {
  const tab = appTabs.find(value => value === search.tab);
  const researchType = search.researchType === "domain" || search.researchType === "page" || search.researchType === "query"
    ? search.researchType : undefined;
  const researchValue = typeof search.researchValue === "string" && search.researchValue.length <= 4096
    ? search.researchValue.trim() : "";
  const tag = typeof search.tag === "string" ? normalizePromptTag(search.tag) : "";
  const scoped = !tab || tab === "overview" || tab === "runs" || tab === "research";
  const metric = (["eligible", "coverage", "brand", "mention", "citation"] as const).find(value => value === search.metric);
  return {
    ...(scoped ? analyticsScope(search) : { set: tab === "prompts" ? resourceId(search.set) : undefined }),
    ...(tab === "runs" && metric ? { metric } : {}),
    org: resourceId(search.org),
    workspace: resourceId(search.workspace),
    tab,
    prompt: tab === "prompts" ? resourceId(search.prompt) : undefined,
    tag: tab === "prompts" && validPromptTag(tag) ? tag : undefined,
    run: tab === "runs" ? resourceId(search.run) : undefined,
    runPrompt: tab === "runs" ? resourceId(search.runPrompt) : undefined,
    researchType: (tab === "research" || tab === "runs") && researchValue ? researchType : undefined,
    researchValue: (tab === "research" || tab === "runs") && researchType && researchValue ? researchValue : undefined,
    trial: search.trial === "start" ? "start" : undefined,
  };
}

export function appReturnPath(value: string | null) {
  if (!value || !/^\/app(?:\?|$)/.test(value)) return "/app";
  const url = new URL(value, "https://trackrank.invalid");
  const search = parseAppSearch(Object.fromEntries(url.searchParams));
  const query = new URLSearchParams();
  for (const [key, entry] of Object.entries(search)) if (entry) query.set(key, entry);
  return query.size ? "/app?" + query : "/app";
}

export function appLoginPath(search: string, hash: string) {
  const next = appReturnPath("/app" + search);
  const query = new URLSearchParams();
  if (next !== "/app") query.set("next", next);
  if (new URLSearchParams(search).get("trial") === "start") query.set("trial", "start");
  return "/login" + (query.size ? "?" + query : "") + hash;
}
