import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/setup")({ component: Setup });
function Setup() {
  return (
    <main className="setup-page shell">
      <Link to="/">← Trackrank AI home</Link>
      <p className="section-eyebrow">OPERATOR SETUP</p>
      <h1>Connect authentication.</h1>
      <p>
        The application uses Better Auth on Cloudflare. These configuration
        steps are for the deployment owner, not an onboarding flow.
      </p>
      <section>
        <h2>1. Google sign-in</h2>
        <ol>
          <li>
            Open{" "}
            <a
              href="https://console.cloud.google.com/auth/overview"
              target="_blank"
              rel="noreferrer"
            >
              Google Auth Platform
            </a>{" "}
            and create or select a project.
          </li>
          <li>
            Configure branding as Trackrank AI, an External audience, and the
            support/developer email. If in Testing, add your email and the users who need test access.
          </li>
          <li>
            Create an OAuth client with application type{" "}
            <strong>Web application</strong>.
          </li>
          <li>
            Authorized JavaScript origin: <code>https://trackrank.ai</code>
          </li>
          <li>
            Authorized redirect URI:{" "}
            <code>https://trackrank.ai/api/auth/callback/google</code>
          </li>
          <li>
            In Cloudflare → Workers &amp; Pages → trackrank-ai → Settings →
            Variables and Secrets, add <code>GOOGLE_CLIENT_ID</code> and{" "}
            <code>GOOGLE_CLIENT_SECRET</code>. Store the secret as a Secret, not
            a plain-text variable.
          </li>
          <li>
            Save/deploy and test Continue with Google. Publish the OAuth app
            before wider access, following any review requirements Google shows.
          </li>
        </ol>
      </section>
      <section>
        <h2>2. Email verification and password resets</h2>
        <ol>
          <li>
            Create a{" "}
            <a
              href="https://resend.com/domains"
              target="_blank"
              rel="noreferrer"
            >
              Resend account
            </a>{" "}
            and add <code>mail.trackrank.ai</code> as a sending domain.
          </li>
          <li>
            Add the exact verification DNS records Resend supplies in Cloudflare
            DNS. Do not remove existing Google/email-forwarding MX records; use
            the Resend-provided sending subdomain records where instructed.
          </li>
          <li>
            Create a sending API key scoped to the verified domain where
            available.
          </li>
          <li>
            Add <code>RESEND_API_KEY</code> as a Worker Secret and{" "}
            <code>EMAIL_FROM</code> as{" "}
            <code>Trackrank AI &lt;login@mail.trackrank.ai&gt;</code>.
          </li>
          <li>
            Set <code>SIGNUP_ENABLED</code> to <code>true</code> after the
            sender is verified. Keep this value synchronized in wrangler.jsonc
            so future CLI deployments preserve it.
          </li>
          <li>
            Save/deploy. Create a test account, follow the verification email,
            sign in, then test a password reset and invitation acceptance.
          </li>
        </ol>
        <p>
          Verification is required for email/password login. Passwords are
          hashed by Better Auth; provider credentials are encrypted separately.
        </p>
      </section>
      <section>
        <h2>3. Your provider accounts</h2>
        <p>
          After signing in, create an organization. Open Settings to save the
          DataForSEO API login and API password—not your dashboard password.
          OpenRouter is optional; provide a key and model identifier to enable
          paid opportunity analysis. Standard collection is the default. Nothing
          runs until you explicitly run a prompt or enable a schedule.
        </p>
      </section>
      <section>
        <h2>Verify your deployment</h2>
        <p>
          Test Google sign-in, email verification and password reset, team invitations,
          and a capped provider run. For questions about hosted subscriptions, see
          the <Link to="/pricing">pricing page</Link>.
        </p>
      </section>
      <Button asChild>
        <Link to="/login">Go to sign in</Link>
      </Button>
    </main>
  );
}
