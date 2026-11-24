export function publicSettings(config: { PUBLIC_OPERATOR_NAME?: string; PUBLIC_SUPPORT_EMAIL?: string; PUBLIC_GTM_ID?: string }) {
  const email = config.PUBLIC_SUPPORT_EMAIL?.trim();
  const gtmId = config.PUBLIC_GTM_ID?.trim();
  return {
    googleTagManagerId: gtmId && /^GTM-[A-Z0-9]+$/.test(gtmId) ? gtmId : null,
    operator: config.PUBLIC_OPERATOR_NAME?.trim() || 'Your Trackrank AI operator',
    email: email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null,
  };
}
