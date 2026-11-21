const appTabs = ["overview", "prompts", "research", "runs", "brands", "schedules", "team", "settings", "agents"] as const;
export type AppTab = typeof appTabs[number];

export type AppSearch = {
  org?: string;
  workspace?: string;
  tab?: AppTab;
  prompt?: string;
  run?: string;
  trial?: "start";
  billing?: "processing" | "canceled";
};

function resourceId(value: unknown) {
  return typeof value === "string" && /^[\w-]{1,100}$/.test(value) ? value : undefined;
}

export function parseAppSearch(search: Record<string, unknown>): AppSearch {
  const prompt = resourceId(search.prompt);
  const run = resourceId(search.run);
  const tab = appTabs.find(value => value === search.tab) ?? (prompt ? "prompts" : run ? "runs" : undefined);
  return {
    org: resourceId(search.org),
    workspace: resourceId(search.workspace),
    tab,
    prompt: tab === "prompts" ? prompt : undefined,
    run: tab === "runs" ? run : undefined,
    trial: search.trial === "start" ? "start" : undefined,
    billing: search.billing === "processing" || search.billing === "canceled" ? search.billing : undefined,
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
