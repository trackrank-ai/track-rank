import { test } from "node:test";
import assert from "node:assert/strict";
import { localAuthEnabled } from "../src/server/local-auth";

test("verification bypass needs development, opt-in, and a loopback URL", () => {
  const env = { BASE_URL: "http://localhost:3000", DEV_SKIP_EMAIL_VERIFICATION: "true" };
  assert.equal(localAuthEnabled(env, true), true);
  assert.equal(localAuthEnabled(env, false), false);
  assert.equal(localAuthEnabled(env), false); // Node is not Vite development.
  assert.equal(localAuthEnabled({ ...env, DEV_SKIP_EMAIL_VERIFICATION: undefined }, true), false);
  for (const BASE_URL of ["https://trackrank.ai", "http://trackrank.ai", "http://localhost.example.com", "http://localhost@evil.com", "invalid"]) {
    assert.equal(localAuthEnabled({ ...env, BASE_URL }, true), false);
  }
  for (const BASE_URL of ["http://127.0.0.1:3000", "http://[::1]:3000"]) {
    assert.equal(localAuthEnabled({ ...env, BASE_URL }, true), true);
  }
});
