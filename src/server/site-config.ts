import { createServerFn } from '@tanstack/react-start';
import { publicSettings } from './public-settings';
import { billingOffers, publicBillingOffers } from './billing-catalog';
import type { Env } from './types';

// Only whitelisted public values may cross into the browser, never the env object.
export const getSiteConfig = createServerFn({ method: 'GET' }).handler(async () => {
  const { env } = await import('cloudflare:workers');
  return publicSettings(env as { PUBLIC_OPERATOR_NAME?: string; PUBLIC_SUPPORT_EMAIL?: string });
});

export const getPricingCatalog = createServerFn({ method: 'GET' }).handler(async () => {
  const { env: bindings } = await import('cloudflare:workers');
  const env = bindings as unknown as Env;
  return { origin: new URL(env.BASE_URL).origin, hosted: env.BILLING_ENABLED === 'true', offers: publicBillingOffers(await billingOffers(env)) };
});
