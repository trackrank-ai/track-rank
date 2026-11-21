# Hosted beta operations

Operator: **Track Rank Ai**. Support, privacy/deletion and security contact: **info@trackrank.ai**.

## Inbox and user requests

- Verify the inbox receives external mail before onboarding users. Check it each business day; there is no published response-time SLA. The app supplies mailto links, not a built-in ticket queue.
- Keep support messages out of public issues. Ask for a run ID, approximate time and organization, not credentials, cookies or full raw payloads.
- For access/correction/deletion requests, verify the requester through their account email and verify organization authority separately. A team member does not automatically have authority to delete an organization's records.
- Inventory account records, memberships, invites, keys, audit records, D1 run/usage data and referenced R2 objects before deletion. Resolve shared organization data ownership. Revoke sessions/keys, pause schedules and stop pending work as appropriate before erasure.
- There is no complete account/organization deletion workflow yet. Better Auth user deletion or a database row deletion alone does not constitute complete TrackRank erasure. Do not perform an improvised production cascade; build and test an explicit D1/R2 deletion procedure first. Track requests, applicable deadlines, restrictions and completion privately.
- CSV export contains run history only. Handle requests for other personal information separately. Do not promise fixed deletion timing or a backup-erasure deadline until implementation and legal requirements are established.

## Incident response

1. Confirm scope using run IDs, tenant IDs and redacted logs; do not copy customer secrets into tickets.
2. Contain: pause affected schedules, revoke compromised TrackRank/provider credentials, restrict the affected feature or deployment. Removing stored credentials does not cancel provider-accepted work.
3. Preserve necessary evidence with restricted access. Assess affected accounts, data and third-party exposure.
4. Notify the operator promptly. Assess applicable notification duties and notify affected people/providers as required; no automatic breach-notification system exists.
5. Verify the fix, restore safely, and record a private incident timeline and prevention steps.

## Recovery and retention — still launch work

- Retain AUTH_SECRET and CREDENTIALS_KEY securely outside the app deployment. Do not rotate CREDENTIALS_KEY without a tested credential migration.
- Before promising recoverability, verify D1 recovery capability, R2 backup/versioning and retention for this deployment, and perform a restore into an isolated environment. Record achieved recovery point/time; do not advertise untested targets.
- Define and implement retention periods for raw results, normalized history, auth/rate-limit records, audit events, support messages and backups. Current workspace results have no universal automatic expiry.
- Add external failure/availability monitoring and a tested notification destination. At minimum cover Worker errors, stuck/uncertain runs, queue backlog and provider failures. A health endpoint alone is not an alerting system.
- Add separate staging, a reversible deployment procedure and a tested D1/R2 deletion workflow before broad public launch.

## Policy maintenance

Public routes: `/privacy`, `/terms`, `/support`, `/security`; `/.well-known/security.txt` uses the configured support email and deployment origin, with a rolling 180-day expiry. It returns 404 when no contact email is configured.

The policies describe the current hosted beta, not a paid subscription. Before publishing new billing, analytics, subprocessors, residency commitments or retention features, update the policies and user notices to match. Have the final business identity and legal terms reviewed before a broad paid launch; these pages are not a claim of regulatory certification.

Reference: [FTC privacy/security guidance](https://www.ftc.gov/business-guidance/privacy-security) and [FTC information-security guide](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business). These references informed the emphasis on accurate disclosures and not promising unimplemented retention/security controls.

## Tested operator erasure procedure (supersedes the earlier missing-workflow note)

The owner-only `POST /api/operations/erase` supports `organization` or `account`.
It is disabled during normal operation. Never put the operator token in a shell
argument, repository, support case or browser address. Use a private owner script
that reads `.production-operations.local` and sends a bearer header over HTTPS.

1. Verify requester email, organization ownership, scope and any applicable legal
   retention requirements. Record authorization privately; preview is not consent.
2. For organization erasure, cancel the Stripe subscription, expire open Checkout
   sessions, reconcile its terminal status, resolve outstanding provider tasks and
   stop future schedules. Provider work already accepted cannot be recalled by
   deleting TrackRank records. Stripe financial records are retained, not erased
   by this operation; handle provider/Stripe privacy requests separately.
3. Obtain an encrypted recovery snapshot and record the pending erasure in a
   private support ledger OUTSIDE the restored database. Backups contain deleted
   data until expiry; never restore one without replaying the erasure ledger.
4. Deploy `MAINTENANCE_MODE=true` and `MAINTENANCE_SINCE=<epoch milliseconds>`.
   This pauses app access, auth, schedules and new provider calls. Billing webhooks
   remain available. Wait at least 10 minutes for existing requests to drain.
   Terminate ALL Workflow instances for the organization, including queued and
   paused ones, using Cloudflare Workflows. Old workflow versions can retain old
   bindings; a maintenance flag alone does not stop them. The erase handler checks
   that every recorded Workflow is complete, errored or terminated and rejects
   unresolved submitting/submitted/uncertain runs.
5. POST `{ "kind":"organization", "id":"<verified-id>" }` for a preview.
   Review its counts and object prefix. Execution requires the exact additional
   field `"confirm":"erase:organization:<verified-id>"`. This removes only the
   organization's R2 prefix first, then deletes its D1 runs/dependencies/cascades
   transactionally. An R2 failure preserves SQL inventory for a safe retry.
   It does NOT erase member accounts, other organizations, retained billing-alert
   audit evidence or provider/Stripe financial records.
6. For account erasure, first transfer/erase any owned organizations and remove
   memberships elsewhere through authorized organization management. Preview with
   `kind=account`; execute with `confirm=erase:account:<verified-id>`. Remaining
   memberships cause a hard refusal. Sessions, OAuth/password accounts, API keys,
   matching verification records and authored invitations are removed; claimed
   invitations are anonymized. Shared organization data is untouched.
7. Verify the target is gone, its R2 prefix is empty, other tenants still work,
   and `PRAGMA foreign_key_check` is empty. Resume maintenance only after checks.
   Record completion and retained/excluded records privately. Remove/expire backup
   copies under the established retention/legal policy; do not promise immediate
   erasure from all third-party/backup systems.

Automated isolated tests cover maintenance refusal, malformed maintenance time,
active billing refusal, non-destructive preview, R2 failure/retry, tenant isolation,
foreign-key integrity, membership refusal and account authentication-data erasure.
No real production customer/account was deleted. This runbook does not establish
legal retention periods or substitute for reviewing a specific deletion request.
