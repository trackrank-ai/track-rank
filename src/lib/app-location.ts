import { analyticsScope, answerMetrics, type AnalyticsScope, type AnswerMetric, type TrendMetric } from "./analytics-filters";
import { normalizePromptTag, validPromptTag } from "./prompt-tags";

const appTabs = ["overview", "tracking", "prompts", "research", "runs", "brands", "schedules", "team", "settings", "agents", "workspaces"] as const;
export type AppTab = typeof appTabs[number];
const researchTypes = ["domain", "page", "query"] as const;
export type ResearchType = typeof researchTypes[number];
export const settingsSections = { providers: "Providers", team: "Team & access", billing: "Billing" } as const;
export type SettingsSection = keyof typeof settingsSections;

export const runStatuses = ["queued", "submitting", "submitted", "succeeded", "failed", "uncertain"] as const;
export const runOutcomes = ["pending", "failed", "uncertain", "organic", "no_answer", "no_evidence", "eligible"] as const;

export type AppSearch = AnalyticsScope & {
  metric?: AnswerMetric;
  trendMetric?: TrendMetric;
  evidenceDay?: string;
  org?: string;
  workspace?: string;
  tab?: AppTab;
  prompt?: string;
  question?: string;
  trackingView?: "overview" | "questions" | "answers" | "settings";
  questionView?: "answers" | "settings";
  promptView?: "create" | "schedule";
  setupIntent?: "schedule";
  promptEngine?: AnalyticsScope["engine"];
  promptSchedule?: "active" | "inactive";
  promptBrand?: string;
  tag?: string;
  run?: string;
  evidence?: "answer" | "citations" | "queries" | "organic" | "analysis";
  batch?: string;
  receipt?: string;
  runPrompt?: string;
  q?: string;
  status?: typeof runStatuses[number];
  outcome?: typeof runOutcomes[number];
  brand?: string;
  researchGroup?: ResearchType;
  researchType?: ResearchType;
  researchValue?: string;
  settingsSection?: SettingsSection;
  trial?: "start";
};

function resourceId(value: unknown) {
  return typeof value === "string" && /^[\w-]{1,100}$/.test(value) ? value : undefined;
}

export function parseAppSearch(search: Record<string, unknown>): AppSearch {
  const tab = appTabs.find(value => value === search.tab);
  const researchType = researchTypes.find(type => type === search.researchType);
  const researchValue = typeof search.researchValue === "string" && search.researchValue.length <= 4096
    ? search.researchValue.trim() : "";
  const tag = typeof search.tag === "string" ? normalizePromptTag(search.tag) : "";
  const scoped = !tab || tab === "overview" || tab === "runs" || tab === "research" || tab === "tracking";
  const scope = analyticsScope(tab === "research" ? { ...search, compareBrand: undefined } : search);
  const metric = answerMetrics.find(value => value === search.metric);
  const trendMetric = search.trendMetric === "mention" || search.trendMetric === "citation" ? search.trendMetric : undefined;
  const trackingSet = resourceId(search.set);
  const trackingView = trackingSet && (tab === "tracking" || tab === "runs" || tab === "prompts" || tab === "schedules")
    ? (["overview", "questions", "answers", "settings"] as const).find(value => value === search.trackingView) : undefined;
  const historyContext = tab === "runs" || (tab === "tracking" && trackingView === "answers");
  const evidenceDay = historyContext && trendMetric ? analyticsScope({ from: search.evidenceDay }).from : undefined;
  const questionContext = tab === "prompts" || (tab === "runs" && !!resourceId(search.run));
  const question = questionContext ? resourceId(search.question) : undefined;
  const libraryContext = tab === "prompts" || !!question;
  return {
    ...(scoped ? scope : tab === "prompts"
      ? { set: resourceId(search.set), from: analyticsScope(search).from, to: analyticsScope(search).to } : tab === "schedules" ? { set: trackingSet } : {}),
    trackingView,
    ...(historyContext && metric && (!metric.startsWith("compare_") || scope.compareBrand) ? { metric } : {}),
    trendMetric: (!tab || tab === "overview" || historyContext || tab === "tracking") ? trendMetric : undefined,
    evidenceDay: evidenceDay && (!scope.from || evidenceDay >= scope.from) && (!scope.to || evidenceDay <= scope.to) ? evidenceDay : undefined,
    org: resourceId(search.org),
    workspace: resourceId(search.workspace),
    tab,
    prompt: tab === "prompts" ? resourceId(search.prompt) : undefined,
    question,
    questionView: question
      ? (["answers", "settings"] as const).find(value => value === search.questionView) : undefined,
    promptView: tab === "prompts" && (search.promptView === "create" || search.promptView === "schedule") ? search.promptView : undefined,
    setupIntent: tab === "prompts" && search.promptView === "create" && search.setupIntent === "schedule" ? "schedule" : undefined,
    promptEngine: libraryContext ? analyticsScope({ engine: search.promptEngine }).engine : undefined,
    promptSchedule: libraryContext && (search.promptSchedule === "active" || search.promptSchedule === "inactive")
      ? search.promptSchedule : undefined,
    promptBrand: libraryContext ? resourceId(search.promptBrand) : undefined,
    tag: libraryContext && validPromptTag(tag) ? tag : undefined,
    batch: tab === "runs" ? resourceId(search.batch) : undefined,
    receipt: tab === "prompts" || tab === "runs" ? resourceId(search.receipt) : undefined,
    run: tab === "runs" ? resourceId(search.run) : undefined,
    evidence: tab === "runs" && resourceId(search.run)
      ? (["answer", "citations", "queries", "organic", "analysis"] as const).find(value => value === search.evidence) : undefined,
    runPrompt: historyContext ? resourceId(search.runPrompt) : undefined,
    q: (historyContext || tab === "prompts") && typeof search.q === "string" && search.q.length <= 200 ? search.q : undefined,
    status: historyContext ? runStatuses.find(value => value === search.status) : undefined,
    outcome: historyContext ? runOutcomes.find(value => value === search.outcome) : undefined,
    brand: historyContext || tab === "prompts" ? resourceId(search.brand) : undefined,
    researchGroup: tab === "research" || tab === "runs" ? researchTypes.find(type => type === search.researchGroup) : undefined,
    settingsSection: tab === "settings"
      ? (Object.keys(settingsSections) as SettingsSection[]).find(section => section === search.settingsSection) : undefined,
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
