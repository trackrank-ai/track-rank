import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSampleCount } from "../src/lib/schedule-settings";

test("sample drafts only yield a collection count for whole numbers within the accepted bounds", () => {
  for (const invalid of ["", "0", "11", "-1", "1.5", "5e0", "5x"]) {
    assert.equal(parseSampleCount(invalid), undefined, JSON.stringify(invalid));
  }
  assert.deepEqual(["1", "5", "10"].map(parseSampleCount), [1, 5, 10]);
});
