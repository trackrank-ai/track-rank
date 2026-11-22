import { LegalLinks } from "@/components/legal-layout";
import { ThemeToggle } from "@/components/theme-toggle";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, KeyRound, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { appReturnPath } from "@/lib/app-location";
export const Route = createFileRoute("/login")({ component: Login });
function authDestination() {
  const query = new URLSearchParams(location.search);
  const app = new URL(appReturnPath(query.get("next")), location.origin);
  if (query.get("trial") === "start") app.searchParams.set("trial", "start");
  app.hash = location.hash;
  return app.href;
}

function resetDestination() {
  const url = new URL(location.href);
  url.searchParams.delete("token");
  url.searchParams.delete("error");
  return url;
}

function Login() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login"),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [config, setConfig] = useState<{
      google_auth: boolean;
      email_auth: boolean;
      local_auth: boolean;
      signup_enabled: boolean;
    } | null>(null);
  const [resetToken, setResetToken] = useState("");
  const [trialSignup, setTrialSignup] = useState(false);
  useEffect(() => {
    fetch("/api/health")
      .then(
        (r) =>
          r.json() as Promise<{
            google_auth: boolean;
            email_auth: boolean;
      local_auth: boolean;
            signup_enabled: boolean;
          }>,
      )
      .then(setConfig)
      .catch(() => setError("Unable to load login settings"));
    const q = new URLSearchParams(location.search);
    if (q.get("trial") === "start") {
      setTrialSignup(true);
      setMode("signup");
    }
    if (q.get("token")) {
      setMode("reset");
      setResetToken(q.get("token") || "");
    }
    if (q.get("error")) {
      const code = q.get("error")?.toLowerCase().replaceAll(" ", "_");
      setError(code === "account_not_linked"
        ? "Verify the email on your existing account before linking Google. Sign in with your original method, then retry Google."
        : "The login link could not be used. Please try again.");
    }
  }, []);
  async function authRequest(path: string, data: unknown) {
    const r = await fetch("/api/auth/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = (await r.json()) as {
      message?: string;
      error?: string;
      url?: string;
    };
    if (!r.ok) throw new Error(d.message || d.error || "Authentication failed");
    return d;
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setStatus("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const email = String(f.get("email") || ""),
        password = String(f.get("password") || "");
      if (mode === "reset") {
        if (resetToken) {
          await authRequest("reset-password", {
            newPassword: password,
            token: resetToken,
          });
          setStatus("Password updated. You can now sign in.");
          setResetToken("");
          setMode("login");
          history.replaceState(null, "", resetDestination());
        } else {
          await authRequest("request-password-reset", {
            email,
            redirectTo: resetDestination().href,
          });
          setStatus("If that account exists, a reset link has been sent.");
        }
      } else if (mode === "signup") {
        await authRequest("sign-up/email", {
          email,
          password,
          name: String(f.get("name")),
          callbackURL: authDestination(),
        });
        if (config?.local_auth) location.assign(authDestination());
        else setStatus("If this is a new account, check your inbox to verify your email. Already registered? Continue with Google or use Set / reset password; signing up again does not change your password.");
      } else {
        await authRequest("sign-in/email", {
          email,
          password,
          callbackURL: authDestination(),
        });
        location.assign(authDestination());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setError("");
    setBusy(true);
    try {
      const d = await authRequest("sign-in/social", {
        provider: "google",
        callbackURL: authDestination(),
      });
      if (d.url) location.assign(d.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed");
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-theme"><ThemeToggle /></div>
      <Link to="/" className="auth-back">
        <ArrowLeft size={14} /> TrackRank home
      </Link>
      <div className="auth-brand">
        <span className="brand-mark">
          <svg viewBox="0 0 32 32" fill="none">
            <path
              d="M7 24V17M16 24V11M25 24V5"
              stroke="currentColor"
              strokeWidth="4"
            />
          </svg>
        </span>{" "}
        trackrank.ai
      </div>
      <Card className="auth-card">
        <CardContent>
          <h1>
            {mode === "signup"
              ? "Create your account."
              : mode === "reset"
                ? "Set or reset your password."
                : "Welcome back."}
          </h1>
          <p className="auth-intro">
            {mode === "signup"
              ? trialSignup
                ? "Start your 14-day free trial. No payment card required."
                : "Create an account to set up your workspace."
              : "Use Google or your TrackRank password. Signed up with Google? Set a password using the link below—not your Google password."}
          </p>
          {config?.local_auth && (
            <p className="auth-intro">Local development: email verification is skipped. Use a test email and password.</p>
          )}
          {config && !config.email_auth && !config.google_auth && (
            <div className="setup-notice">
              <KeyRound size={16} />
              <div>
                <strong>Authentication setup in progress</strong>
                <p>
                  Google and email delivery credentials are not connected yet.
                  Account creation and password-reset email are paused until they are configured. Existing verified accounts can still sign in with their password.
                </p>
                <Link to="/setup">
                  View setup requirements <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          )}
          {mode !== "reset" && (
            <>
              <Button
                variant="outline"
                className="google-login"
                disabled={busy || !config?.google_auth}
                onClick={google}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="17"
                  height="17"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2 .9-3.4.9a6 6 0 0 1-5.6-4.1H3v2.7A10 10 0 0 0 12 22Z M6.4 13.8a6 6 0 0 1 0-3.6V7.5H3a10 10 0 0 0 0 9l3.4-2.7Z M12 6.1c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.5l3.4 2.7A6 6 0 0 1 12 6.1Z"
                  />
                </svg>
                Continue with Google{" "}
                {!config?.google_auth && <span>· setup pending</span>}
              </Button>
              <div className="auth-divider">
                <span>or continue with email</span>
              </div>
            </>
          )}
          {mode !== "reset" && <p className="auth-legal">By creating an account or continuing with Google, you agree to the <Link to="/terms">Terms of Service</Link>. Read our <Link to="/privacy">Privacy Policy</Link> to learn how we handle your data.</p>}
          <form onSubmit={submit} className="form-stack">
            {mode === "signup" && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                />
              </label>
            )}
            {!resetToken && (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </label>
            )}
            {(mode !== "reset" || resetToken) && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={128}
                  required
                  placeholder={
                    mode === "login"
                      ? "Your password"
                      : "At least 12 characters"
                  }
                />
              </label>
            )}
            <Button
              type="submit"
              disabled={
                busy ||
                !config ||
                (mode !== "login" && !config?.email_auth) ||
                (mode === "signup" && !config?.signup_enabled)
              }
            >
              {busy
                ? "Please wait…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "reset"
                    ? resetToken
                      ? "Save new password"
                      : "Send reset link"
                    : "Sign in"}
              <ArrowRight size={15} />
            </Button>
          </form>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {status && (
            <p role="status" className="form-success">
              <Mail size={15} />
              {status}
            </p>
          )}
          <LegalLinks />
          <div className="auth-links">
            {mode === "login" ? (
              <>
                <button
                  onClick={() => {
                    setMode("signup");
                    setError("");
                    setStatus("");
                  }}
                >
                  Create an account
                </button>
                <button
                  onClick={() => {
                    setMode("reset");
                    setError("");
                    setStatus("");
                  }}
                >
                  Set / reset password
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setMode("login");
                  setResetToken("");
                  setError("");
                  setStatus("");
                }}
              >
                Back to sign in
              </button>
            )}
          </div>
        </CardContent>
      </Card>
      <p className="auth-footnote">
        API keys and organization access are managed after signing in.
      </p>
    </main>
  );
}
