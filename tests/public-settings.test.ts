import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicSettings } from '../src/server/public-settings';

test('public configuration is deployment-owned, whitelisted and does not leak secrets', () => {
  const env = { PUBLIC_OPERATOR_NAME: 'Example Operator', PUBLIC_SUPPORT_EMAIL: 'help@example.test', AUTH_SECRET: 'secret', CREDENTIALS_KEY: 'secret' };
  assert.deepEqual(publicSettings(env), { googleTagManagerId: null, operator: 'Example Operator', email: 'help@example.test' });
  assert.deepEqual(publicSettings({}), { googleTagManagerId: null, operator: 'Your Trackrank AI operator', email: null });
  assert.equal(publicSettings({ PUBLIC_SUPPORT_EMAIL: 'help@example.test\r\nInjected: true' }).email, null);
});

test('Google Tag Manager is opt-in and only accepts container IDs', () => {
  assert.equal(publicSettings({ PUBLIC_GTM_ID: 'GTM-TXR45VFN' }).googleTagManagerId, 'GTM-TXR45VFN');
  assert.equal(publicSettings({ PUBLIC_GTM_ID: 'GTM-<script>' }).googleTagManagerId, null);
  assert.equal(publicSettings({ PUBLIC_GTM_ID: 'G-ANALYTICS' }).googleTagManagerId, null);
});
