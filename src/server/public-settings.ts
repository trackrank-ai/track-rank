export function publicSettings(config: { PUBLIC_OPERATOR_NAME?: string; PUBLIC_SUPPORT_EMAIL?: string }) {
  const email = config.PUBLIC_SUPPORT_EMAIL?.trim();
  return {
    operator: config.PUBLIC_OPERATOR_NAME?.trim() || 'Your TrackRank operator',
    email: email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null,
  };
}
