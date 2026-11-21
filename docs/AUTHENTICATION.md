# Identity, login methods, and invitations

## One user, multiple login methods

Better Auth stores one user identity and separate credential/Google provider accounts pointing to that user. Email signup and Google profile handling normalize case; do not strip Gmail dots, remove plus aliases, or merge different email addresses. Those are distinct application identities.

The application explicitly enables same-email implicit linking, requires the existing local email to be verified, requires Google to attest a verified email, and disallows different-email linking. No trusted-provider bypass is configured. Never solve `account_not_linked` by disabling the local verification requirement: that can leave an attacker-chosen password attached to a victim's future Google account.

| Starting point | Later action | Result |
|---|---|---|
| Verified password user | Google with the same verified email | Google method attaches to the same user; memberships, keys, organizations, and plan assignments stay intact |
| Unverified password user | First Google sign-in with matching email | Linking rejected until existing local email is verified |
| Google-only user | Password sign-in | Invalid credentials until the owner sets a password |
| Google-only user | Password signup with same email | Generic anti-enumeration response; no second user, no password installed |
| Any existing user | Repeated signup with another password | Does not change the account's password |
| Google-only user | Request reset -> consume emailed token -> choose password | Adds credentials to the same user; Google method remains available |
| Different email | Google/password signup | Separate user, not automatic identity merge |

Password-reset tokens are single-use and session revocation on reset is enabled. Invitation fragments are preserved through login, account switching, and password-reset callbacks. Closing SIGNUP_ENABLED also blocks new Google signups while retaining existing-user login. A Google user's Google password is never their TrackRank password. Password creation/reset needs configured email delivery even in local development. UI instructions are generic so duplicate-signup responses do not reveal whether a given email is registered. Signup responses must not promise delivery for every duplicate request.

Local verification bypass remains restricted to Vite development, explicit opt-in, and HTTP loopback URLs. It also permits local test users to accept named invitations. Production never honors that bypass.

## Invitations are membership changes, not identity merges

Owners/admins create a named invitation with `{email,role}` and privately share the generated single-use link. Creation **does not send email**. Invitations expire after seven days and can be revoked. API keys cannot create, inspect, or accept invitations.

An authenticated user previews the organization, invited email, assigned/current role, expiry, and signed-in identity, then explicitly accepts. The preview does not claim the invitation. A mismatched user can switch accounts without losing the link. Acceptance requires both matching email and verified mailbox ownership. Server-side transaction predicates recheck identity, email proof, expiry and single-use status; client UI checks alone are not sufficient.

Existing memberships retain their role; accepting an invitation cannot silently replace an owner/admin role with an invited lower role. A new membership does not merge either user's identity, organizations, credentials, API keys, billing, plan, or usage budgets. An existing user can join another organization and switch between them. Organizations remain isolated.

Migration `0005_recipient_invitations.sql` expires old unclaimed bearer links that lack a recipient. They cannot be securely retrofitted with a guessed email. Owners must generate new named invitations. Claimed historical invitations and memberships are preserved.

## Verification and release checks

Automated tests execute actual Better Auth handlers and the Drizzle/D1 adapter against SQLite. Google's external token proof/profile is mocked only in the test harness. Mail delivery is a mocked Resend transport; reset tokens are generated and consumed by the real handler. Coverage includes both login directions, duplicate signup, preservation of existing passwords and memberships, rejection of unverified local/provider emails, one-use password reset and session revocation, invitation identity matching, verification, preview, expiry, revocation, and multiple-organization membership.

These tests are NOT a substitute for live Google consent/callback, actual inbox delivery/verification/reset, and visual acceptance on the deployed site. No external email or paid provider request is needed to run the tests. The local HTTP smoke script covers named invitations through real signup sessions under the loopback-only verification bypass; it does not validate production mailbox ownership.

References: https://better-auth.com/docs/concepts/users-accounts and https://better-auth.com/docs/authentication/email-password
