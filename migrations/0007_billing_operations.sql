ALTER TABLE billing_customers ADD COLUMN risk_hold INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_customers ADD COLUMN trial_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_customers ADD COLUMN reconcile_at INTEGER NOT NULL DEFAULT 0;
CREATE TABLE billing_sync_locks (
 customer_id TEXT PRIMARY KEY,
 token TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE billing_alerts (
 id TEXT PRIMARY KEY,
 org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
 kind TEXT NOT NULL,
 resource_id TEXT NOT NULL,
 summary TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 notified_at INTEGER,
 resolved_at INTEGER
);
CREATE INDEX billing_alerts_pending ON billing_alerts(resolved_at,notified_at,created_at);
-- Self-hosting retains beta-v1. Hosted production can opt new organizations into pending-v1.
INSERT INTO plan_versions VALUES('pending-v1','pending','Awaiting subscription',0,'usd','month','active','{"api_per_minute":60,"api_per_month":20000,"provider_per_minute":1,"runs_per_month":1,"concurrent_runs":1}',0);
