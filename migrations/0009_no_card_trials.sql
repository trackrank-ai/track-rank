-- Application-managed trials do not create Stripe customers or payment obligations.
INSERT INTO plan_versions SELECT 'trial-v1','trial','14-day free trial',0,'usd','month','active',limits_json,0 FROM plan_versions WHERE id='starter-v1';
CREATE TABLE organization_trials (org_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,started_at INTEGER NOT NULL,ends_at INTEGER NOT NULL CHECK(ends_at>started_at));
-- One introductory trial per verified account, even after deleting its first organization.
CREATE TABLE account_trial_claims (user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,org_id TEXT UNIQUE REFERENCES organizations(id) ON DELETE SET NULL,claimed_at INTEGER NOT NULL);
