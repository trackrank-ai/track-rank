import assert from "node:assert/strict";
import { test } from "node:test";
import { appLoginPath, appReturnPath, parseAppSearch } from "../src/lib/app-location";

test("app links preserve the selected organization, workspace and record through login", () => {
  const search = "?org=second-org&workspace=client&tab=runs&run=run-abc";
  const login = new URL(appLoginPath(search, "#invite=example"), "https://trackrank.invalid");
  assert.equal(login.hash, "#invite=example");
  assert.equal(appReturnPath(login.searchParams.get("next")), "/app" + search);
  assert.equal(appReturnPath("/app?tab=runs&runPrompt=prompt-abc"), "/app?tab=runs&runPrompt=prompt-abc");
  assert.equal(appReturnPath("/app?tab=research&researchType=page&researchValue=https%3A%2F%2Fexample.test%2Fa"),
    "/app?tab=research&researchType=page&researchValue=https%3A%2F%2Fexample.test%2Fa");
  assert.equal(appReturnPath("/app?org=second-org&tab=prompts&prompt=prompt-abc"), "/app?org=second-org&tab=prompts&prompt=prompt-abc");
  const tagged = "?org=second-org&workspace=client&tab=prompts&tag=seattle+location";
  assert.equal(new URL(appLoginPath(tagged, ""), login).searchParams.get("next"), "/app" + tagged);
  assert.equal(new URL(appLoginPath("?trial=start", ""), login).searchParams.get("trial"), "start");
});

test("return paths stay inside the app and accept only supported navigation fields", () => {
  for (const bad of ["//elsewhere.invalid/app", "https://elsewhere.invalid/app", "/app/../login", "/application?org=demo"]) {
    assert.equal(appReturnPath(bad), "/app");
  }
  assert.equal(appReturnPath("/app?org=demo&tab=settings&prompt=ignored&token=discarded&billing=processing#invite=discarded"), "/app?org=demo&tab=settings");
  assert.equal(appReturnPath("/app?org=demo&prompt=prompt-abc&run=run-abc"), "/app?org=demo");
  assert.equal(parseAppSearch({ org: ["first", "second"], run: "../other", tab: "invalid" }).org, undefined);
});

test("filtered analytics and metric links retain their scope through sign-in", () => {
  const original = new URLSearchParams({
    org: "agency", workspace: "client", tab: "runs", set: "local-discovery", tags: "consideration,chicago-market",
    location: "Chicago", engine: "google", from: "2026-11-01", to: "2026-11-20", trackedBrand: "client-brand", compareBrand: "competitor",
    metric: "compare_citation", trendMetric: "citation", evidenceDay: "2026-11-13",
    reportQuestion: "recorded-run-id", reportEngine: "google",
  });
  const login = new URL(appLoginPath("?" + original, ""), "https://trackrank.invalid");
  const result = new URL(login.searchParams.get("next")!, login).searchParams;
  assert.deepEqual(Object.fromEntries(result), { ...Object.fromEntries(original), tags: "chicago-market,consideration" });
});

test("research groups and organization settings destinations survive sign-in", () => {
  const cases: Record<string, string>[] = [
    { org: "agency", workspace: "client", tab: "research", researchGroup: "page", researchType: "page", researchValue: "https://example.test/a", engine: "google" },
    { org: "agency", tab: "settings", settingsSection: "billing" },
  ];
  for (const original of cases) {
    const login = new URL(appLoginPath("?" + new URLSearchParams(original), ""), "https://trackrank.invalid");
    const search = new URL(login.searchParams.get("next")!, login).searchParams;
    assert.deepEqual(Object.fromEntries(search), original);
  }
});

test("question detail and its filters survive the sign-in return", () => {
  const original = new URLSearchParams({
    org: "agency", workspace: "client", tab: "prompts", question: "question-123", questionView: "answers",
    q: "first question", promptEngine: "gemini", promptSchedule: "active", promptBrand: "client", brand: "client",
    from: "2026-11-01", to: "2026-11-20",
  });
  for (const search of [
    original,
    new URLSearchParams({ ...Object.fromEntries(original), tab: "runs", run: "answer-123", evidence: "citations" }),
  ]) {
    const login = new URL(appLoginPath("?" + search, ""), "https://trackrank.invalid");
    const result = new URL(login.searchParams.get("next")!, login).searchParams;
    assert.deepEqual(Object.fromEntries(result), Object.fromEntries(search));
  }
});

test("schedule selection and recurring setup restore the chosen workspace after sign-in", () => {
  for (const view of ["promptView=schedule&promptEngine=gemini", "promptView=create&setupIntent=schedule", "promptView=create&setupFrom=tracking"]) {
    const query = "org=team&workspace=client&tab=prompts&" + view;
    const login = new URL(appLoginPath("?" + query, ""), "https://trackrank.invalid");
    const restored = new URL(login.searchParams.get("next")!, login).searchParams;
    assert.deepEqual(Object.fromEntries(restored), Object.fromEntries(new URLSearchParams(query)));
  }
});

test("tracking links retain workspace, view and evidence scope through sign-in", () => {
  for (const parameters of [
    { tab: "tracking", trackingView: "answers", metric: "mention", trackedBrand: "brand", trendMetric: "mention", evidenceDay: "2026-11-22" },
    { tab: "runs", trackingView: "answers", run: "recorded-run", evidence: "citations" },
    { tab: "prompts", trackingView: "questions", promptView: "create" },
    { tab: "schedules", trackingView: "settings" },
  ] as Record<string, string>[]) {
    const search = { org: "org", workspace: "workspace", set: "named-set", ...parameters };
    const login = new URL(appLoginPath("?" + new URLSearchParams(search), ""), "https://example.test");
    const next = new URL(appReturnPath(login.searchParams.get("next")), login);
    assert.deepEqual(Object.fromEntries(next.searchParams), search);
  }
  assert.equal(parseAppSearch({ tab: "tracking", trackingView: "settings" }).trackingView, undefined);
});

test("prompt answer views preserve the question-library scope through sign-in and run detail", () => {
  const scope = { org: "agency", workspace: "client", set: "tracked", tag: "research",
    promptEngine: "gemini", from: "2026-11-01", to: "2026-11-20", brand: "brand", promptSort: "lowest_mention_rate" };
  for (const selected of [
    { tab: "prompts", promptView: "answers" },
    { tab: "runs", promptView: "answers", run: "answer", evidence: "citations" },
    { tab: "runs", run: "answer", question: "question", questionView: "answers", questionMetric: "citation" },
  ] as Record<string, string>[]) {
    const query = new URLSearchParams({ ...scope, ...selected });
    const login = new URL(appLoginPath("?" + query, ""), "https://example.test");
    const next = new URL(appReturnPath(login.searchParams.get("next")), login);
    assert.deepEqual(Object.fromEntries(next.searchParams), Object.fromEntries(query));
  }
});
