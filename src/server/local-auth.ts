import type { Env } from "./types";

// Vite replaces DEV with false in production builds. The flag alone is never enough.
export function localAuthEnabled(
  env: Pick<Env, "BASE_URL" | "DEV_SKIP_EMAIL_VERIFICATION">,
  development = import.meta.env?.DEV === true,
): boolean {
  if (!development || env.DEV_SKIP_EMAIL_VERIFICATION !== "true") return false;
  try {
    const url = new URL(env.BASE_URL);
    return url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}
