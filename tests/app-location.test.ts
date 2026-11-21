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
