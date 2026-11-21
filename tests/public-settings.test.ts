import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicSettings } from '../src/server/public-settings';

test('public configuration is deployment-owned, whitelisted and does not leak secrets', () => {
  const env = { PUBLIC_OPERATOR_NAME: 'Example Operator', PUBLIC_SUPPORT_EMAIL: 'help@example.test', AUTH_SECRET: 'secret', CREDENTIALS_KEY: 'secret' };
  assert.deepEqual(publicSettings(env), { operator: 'Example Operator', email: 'help@example.test' });
  assert.deepEqual(publicSettings({}), { operator: 'Your TrackRank operator', email: null });
  assert.equal(publicSettings({ PUBLIC_SUPPORT_EMAIL: 'help@example.test\r\nInjected: true' }).email, null);
});
