import assert from "node:assert/strict";
import { test } from "node:test";
import { reportBrandLabels } from "../src/lib/report-brands";

test("brand choices keep identical names from different workspaces distinguishable after reload", () => {
  const workspaces = [
    { id: "north", name: "North", brand_ids: '["a","b"]' },
    { id: "south", name: "South", brand_ids: '["c"]' },
  ];
  const brands = ["c", "b", "a"].map(id => ({ id, name: "Atlas" }));
  const historical = [{ id: "former", name: "Atlas", workspace_id: "south" }];
  const labels = (input: typeof brands) => Object.fromEntries(
    reportBrandLabels(input, historical, workspaces).map(brand => [brand.id, brand.name]));
  assert.deepEqual(labels(brands), labels([...brands].reverse()));
  assert.deepEqual(labels(brands), {
    a: "Atlas · North · Record 1", b: "Atlas · North · Record 2",
    c: "Atlas · South", former: "Atlas · South · Recorded brand",
  });
});
