import { createServerFn } from '@tanstack/react-start';
import { publicSettings } from './public-settings';

// Only whitelisted public values may cross into the browser, never the env object.
export const getSiteConfig = createServerFn({ method: 'GET' }).handler(async () => {
  const { env } = await import('cloudflare:workers');
  return publicSettings(env as { PUBLIC_OPERATOR_NAME?: string; PUBLIC_SUPPORT_EMAIL?: string });
});
