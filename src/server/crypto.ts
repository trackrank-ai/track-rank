import type { Env } from "./types";
const enc = new TextEncoder();
const b64 = (a: Uint8Array) => btoa(String.fromCharCode(...a));
const un64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function hashToken(token: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(token))),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function token() {
  return b64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
async function key(env: Env) {
  return crypto.subtle.importKey(
    "raw",
    un64(env.CREDENTIALS_KEY),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(env: Env, orgId: string, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(orgId) },
    await key(env),
    enc.encode(JSON.stringify(value)),
  );
  return `v1.${b64(iv)}.${b64(new Uint8Array(data))}`;
}
export async function unseal<T>(
  env: Env,
  orgId: string,
  value: string,
): Promise<T> {
  const [v, iv, data] = value.split(".");
  if (v !== "v1") throw new Error("Unsupported encryption key version");
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: un64(iv), additionalData: enc.encode(orgId) },
    await key(env),
    un64(data),
  );
  return JSON.parse(new TextDecoder().decode(raw));
}

export async function callbackSignature(env: Env, runId: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(env.AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", k, enc.encode("callback:" + runId)),
    ),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
