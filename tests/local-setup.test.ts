import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// JS setup utility is shared with the CLI.
// @ts-expect-error plain Node CLI module
import { prepareLocalVars } from '../scripts/setup-local.mjs';

test('local setup initializes independent secrets, preserves them on rerun, and rejects remote URLs', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'trackrank-vars-')), '.dev.vars');
  const template = readFileSync(new URL('../.dev.vars.example', import.meta.url), 'utf8');
  prepareLocalVars(path, template);
  const first = readFileSync(path, 'utf8');
  assert.ok(!first.includes('REPLACE_WITH_'));
  const secrets = [...first.matchAll(/^(?:AUTH_SECRET|CREDENTIALS_KEY)="(.+)"$/gm)].map(m => m[1]);
  assert.equal(secrets.length, 2);
  assert.notEqual(secrets[0], secrets[1]);
  assert.equal(Buffer.from(secrets[1], 'base64').length, 32);
  prepareLocalVars(path, template);
  assert.equal(readFileSync(path, 'utf8'), first);
  const remote = first.replace('http://localhost:3000', 'https://trackrank.ai');
  writeFileSync(path, remote);
  assert.throws(() => prepareLocalVars(path, template), /loopback/);
  assert.equal(readFileSync(path, 'utf8'), remote);
});
