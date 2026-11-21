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
