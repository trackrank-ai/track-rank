import { localAuthEnabled } from "./local-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./auth-schema";
import {
  all,
  exec,
  HttpError,
  now,
  one,
  type Env,
  type Principal,
} from "./types";
import { hashToken } from "./crypto";
async function sendMail(env: Env, to: string, subject: string, url: string) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM)
    throw new HttpError(503, "Email delivery is not configured");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      text: `${subject}\n\n${url}\n\nIf you did not request this, ignore this message.`,
    }),
  });
  if (!r.ok) throw new HttpError(502, "Email delivery failed");
}
export function auth(env: Env) {
  const localAuth = localAuthEnabled(env);
  return betterAuth({
    appName: "TrackRank",
    baseURL: env.BASE_URL,
    secret: env.AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB), { provider: "sqlite", schema }),
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              requireEmailVerification: true,
              disableSignUp: env.SIGNUP_ENABLED !== "true",
            },
          }
        : {},
    user: {
      validateUserInfo: ({ user, source }) => {
        if (source.method === "oauth" && source.oauth?.providerId === "google" && user.emailVerified !== true)
          return { error: "email_not_verified", errorDescription: "Google must verify this email before it can be used for signup or account linking" };
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: false,
        requireLocalEmailVerified: true,
        allowDifferentEmails: false,
        // No trusted-provider bypass: Google must attest the email is verified.
        trustedProviders: [],
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: !localAuth,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      disableSignUp: env.SIGNUP_ENABLED !== "true",
      sendResetPassword: async ({ user, url }) =>
        sendMail(env, user.email, "Reset your TrackRank password", url),
    },
    emailVerification: {
      sendOnSignUp: !localAuth,
      sendOnSignIn: !localAuth,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        if (!localAuth)
          await sendMail(env, user.email, "Verify your TrackRank email", url);
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    trustedOrigins: [env.BASE_URL],
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      useSecureCookies: env.BASE_URL.startsWith("https:"),
      defaultCookieAttributes: {
        sameSite: "lax",
        httpOnly: true,
        secure: env.BASE_URL.startsWith("https:"),
      },
    },
  });
}
export async function authenticate(req: Request, env: Env): Promise<Principal> {
  const bearer = req.headers.get("authorization");
  if (bearer) {
    if (!bearer.startsWith("Bearer trk_"))
      throw new HttpError(401, "Invalid API key");
    const row = await one<{
      id: string;
      org_id: string;
      user_id: string;
      scopes: string;
      role: string;
    }>(
      env,
      "SELECT k.*,m.role FROM api_keys k JOIN memberships m ON m.org_id=k.org_id AND m.user_id=k.user_id WHERE k.token_hash=? AND k.revoked_at IS NULL AND k.expires_at>?",
      await hashToken(bearer.slice(7)),
      now(),
    );
    if (!row) throw new HttpError(401, "API key expired or revoked");
    await exec(
      env,
      "UPDATE api_keys SET last_used_at=? WHERE id=?",
      now(),
      row.id,
    );
    return {
      userId: row.user_id,
      orgId: row.org_id,
      role: row.role,
      scopes: JSON.parse(row.scopes),
      keyId: row.id,
    };
  }
  const session = await auth(env).api.getSession({ headers: req.headers });
  if (!session) throw new HttpError(401, "Please sign in");
  return { userId: session.user.id };
}
export async function tenant(
  env: Env,
  p: Principal,
  orgId: string | null,
  scope = "read",
): Promise<Principal & { orgId: string; role: string }> {
  const id = orgId || p.orgId;
  if (!id || (p.orgId && p.orgId !== id))
    throw new HttpError(403, "Organization access denied");
  const member = await one<{ role: string }>(
    env,
    "SELECT role FROM memberships WHERE org_id=? AND user_id=?",
    id,
    p.userId,
  );
  if (!member) throw new HttpError(403, "Organization access denied");
  if (p.scopes && !p.scopes.includes(scope))
    throw new HttpError(403, `API key needs ${scope} scope`);
  if (scope !== "read" && member.role === "viewer")
    throw new HttpError(403, "Viewer access is read-only");
  return { ...p, orgId: id, role: member.role };
}
export function admin(p: Principal) {
  if (p.keyId || !["owner", "admin"].includes(p.role || ""))
    throw new HttpError(403, "Organization administrator session required");
}
export async function organizations(env: Env, p: Principal) {
  return all(
    env,
    "SELECT o.*,m.role FROM organizations o JOIN memberships m ON m.org_id=o.id WHERE m.user_id=?" +
      (p.orgId ? " AND o.id=?" : ""),
    ...[p.userId, ...(p.orgId ? [p.orgId] : [])],
  );
}
