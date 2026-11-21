import { seal, unseal } from "./crypto";
import { HttpError, now, one, type Env } from "./types";

export type Credentials = {
  login?: string;
  password?: string;
  openrouter_key?: string;
  openrouter_model?: string;
};

export type CredentialProvider = "dataforseo" | "openrouter";

async function credentialCiphertext(env: Env, org: string) {
  return (await one<{ ciphertext: string }>(env,
    "SELECT ciphertext FROM credentials WHERE org_id=?", org,
  ))?.ciphertext ?? null;
}

export async function credentials(env: Env, org: string): Promise<Credentials> {
  const cipher = await credentialCiphertext(env, org);
  return cipher ? unseal<Credentials>(env, org, cipher) : {};
}

export function credentialStatus(c: Credentials) {
  return {
    dataforseo_configured: !!(c.login && c.password),
    openrouter_configured: !!c.openrouter_key,
    openrouter_model: c.openrouter_model || "",
  };
}

export async function updateCredentials(
  env: Env, org: string, update: Partial<Credentials> | CredentialProvider,
) {
  // Both providers share one encrypted row. Re-read when another request changes it.
  for (let attempt = 0; attempt < 4; attempt++) {
    const previous = await credentialCiphertext(env, org);
    const current = previous ? await unseal<Credentials>(env, org, previous) : {};
    const next = { ...current };
    if (update === "dataforseo") {
      delete next.login;
      delete next.password;
    } else if (update === "openrouter") {
      delete next.openrouter_key;
      delete next.openrouter_model;
    } else {
      Object.assign(next, update);
      if (!!next.login !== !!next.password)
        throw new HttpError(400, "Both DataForSEO login and API password are required");
    }

    const pause = update === "dataforseo" ? env.DB.prepare(
      "UPDATE schedules SET enabled=0 WHERE org_id=? AND enabled=1 AND (SELECT ciphertext FROM credentials WHERE org_id=?) IS ?",
    ).bind(org, org, previous) : null;
    if (!previous && !Object.keys(next).length) {
      if (pause) await pause.run();
      return credentialStatus(next);
    }

    let write;
    if (Object.keys(next).length) {
      const cipher = await seal(env, org, next);
      write = previous
        ? env.DB.prepare("UPDATE credentials SET ciphertext=?,updated_at=? WHERE org_id=? AND ciphertext=?")
          .bind(cipher, now(), org, previous)
        : env.DB.prepare("INSERT INTO credentials(org_id,ciphertext,updated_at) VALUES(?,?,?) ON CONFLICT(org_id) DO NOTHING")
          .bind(org, cipher, now());
    } else {
      write = env.DB.prepare("DELETE FROM credentials WHERE org_id=? AND ciphertext=?").bind(org, previous);
    }
    const result = pause ? (await env.DB.batch([pause, write]))[1] : await write.run();
    if (result.meta.changes) return credentialStatus(next);
  }
  throw new HttpError(409, "Credentials changed in another request. Try again.");
}

export async function removeAllCredentials(env: Env, org: string) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM credentials WHERE org_id=?").bind(org),
    env.DB.prepare("UPDATE schedules SET enabled=0 WHERE org_id=? AND enabled=1").bind(org),
  ]);
}
