import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { runUsagePeriods } from "../src/server/run-admission";

test("admission migration backfills the current month, preserves old keys, and buckets new UTC boundary runs", () => {
  const db = new DatabaseSync(":memory:");
  const migration = "0011_run_admission_accounting.sql";
  for (const file of readdirSync("migrations").filter(file => file.endsWith(".sql") && file < migration).sort())
    db.exec(readFileSync("migrations/" + file, "utf8"));
  db.exec(`INSERT INTO organizations(id,name,created_at) VALUES('org','Organization',0);
    INSERT INTO workspaces(id,org_id,name,created_at) VALUES('w','org','Workspace',0);
    INSERT INTO prompts(id,org_id,workspace_id,text,created_at,updated_at) VALUES('p','org','w','Question',0,0)`);
  const newRun = db.prepare(`INSERT INTO runs(id,org_id,prompt_id,workspace_id,prompt_text,config,status,idempotency_key,created_at,updated_at)
    VALUES(?,'org','p','w','Question','{}','queued',?,?,?)`);
  const insert = (id: string, key: string, timestamp: number) => newRun.run(id, key, timestamp, timestamp);
  const periods = runUsagePeriods(Date.now());
  insert("legacy-month", "legacy-month", periods.month.start - 1);
  insert("current-month", "current-month", periods.month.start);
  insert("current-day", "current-day", periods.timestamp);
  db.exec(readFileSync("migrations/" + migration, "utf8"));

  const count = (period: string) => db.prepare("SELECT runs FROM run_usage WHERE org_id='org' AND period=?").get(period)?.runs;
  assert.equal(count(periods.month.key), 2);
  assert.equal(count(periods.day), periods.month.start === periods.dayStart ? 2 : 1);
  assert.equal(count(runUsagePeriods(periods.month.start - 1).month.key), undefined);
  assert.equal(db.prepare("SELECT count(*) AS n FROM run_admissions").get()?.n, 3);

  db.exec("DELETE FROM runs WHERE id='legacy-month'");
  assert.equal(insert("duplicate", "legacy-month", periods.timestamp).changes, 0);
  assert.equal(count(periods.month.key), 2);

  const boundary = Date.UTC(2027, 0, 1);
  const previous = runUsagePeriods(boundary - 1);
  const next = runUsagePeriods(boundary);
  const previousMonthCount = Number(count(previous.month.key) ?? 0);
  const previousDayCount = Number(count(previous.day) ?? 0);
  const nextMonthCount = Number(count(next.month.key) ?? 0);
  const nextDayCount = Number(count(next.day) ?? 0);
  insert("prior-boundary", "prior-boundary", boundary - 1);
  insert("next-boundary", "next-boundary", boundary);
  assert.equal(count(previous.month.key), previousMonthCount + 1);
  assert.equal(count(previous.day), previousDayCount + 1);
  assert.equal(count(next.month.key), nextMonthCount + 1);
  assert.equal(count(next.day), nextDayCount + 1);
  db.close();
});
