-- One explicit billing account per organization. No user owns a subscription.
CREATE TABLE billing_accounts (
 id TEXT PRIMARY KEY NOT NULL DEFAULT ('ba_' || lower(hex(randomblob(16)))),
 org_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
 customer_id TEXT UNIQUE,
 subscription_id TEXT UNIQUE,
 status TEXT NOT NULL DEFAULT 'none',
 price_id TEXT,
 current_period_end INTEGER,
 cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
 event_created INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL DEFAULT 0,
 risk_hold INTEGER NOT NULL DEFAULT 0,
 reconcile_at INTEGER NOT NULL DEFAULT 0,
 UNIQUE(id,org_id)
);
INSERT INTO billing_accounts(org_id,customer_id,subscription_id,status,price_id,current_period_end,cancel_at_period_end,event_created,updated_at,risk_hold,reconcile_at)
SELECT org_id,customer_id,subscription_id,status,price_id,current_period_end,cancel_at_period_end,event_created,updated_at,risk_hold,reconcile_at FROM billing_customers;
INSERT INTO billing_accounts(org_id) SELECT id FROM organizations WHERE id NOT IN (SELECT org_id FROM billing_accounts);
DROP TABLE billing_customers;
CREATE TRIGGER organization_billing_account AFTER INSERT ON organizations
BEGIN INSERT INTO billing_accounts(org_id) VALUES(NEW.id); END;
CREATE TABLE billing_account_admins (
 billing_account_id TEXT NOT NULL,
 org_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 granted_by TEXT NOT NULL,
 granted_at INTEGER NOT NULL,
 PRIMARY KEY(billing_account_id,user_id),
 FOREIGN KEY(billing_account_id,org_id) REFERENCES billing_accounts(id,org_id) ON DELETE CASCADE,
 FOREIGN KEY(org_id,user_id) REFERENCES memberships(org_id,user_id) ON DELETE CASCADE
);
-- Checkout serialization belongs to the billing account, not the acting user.
DROP TABLE billing_checkout_locks;
CREATE TABLE billing_checkout_locks (
 billing_account_id TEXT PRIMARY KEY REFERENCES billing_accounts(id) ON DELETE CASCADE,
 token TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
UPDATE plan_versions SET status='retired' WHERE id IN ('starter-v1','pro-v1');

INSERT INTO plan_versions(id,family,name,price_cents,currency,interval,status,limits_json,created_at)
VALUES('trial-v2','trial','14-day free trial',0,'usd','month','active','{"api_per_minute":120,"provider_per_minute":10,"runs_per_month":10000,"searchable_history_days":30}',CAST(unixepoch('subsec')*1000 AS INTEGER));
UPDATE organization_plans SET plan_version_id='trial-v2',reason='Prelaunch trial configuration' WHERE plan_version_id='trial-v1';
UPDATE plan_versions SET status='retired' WHERE id='trial-v1';
