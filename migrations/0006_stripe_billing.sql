-- Stripe IDs map to exact immutable plan revisions, never to mutable marketing names.
UPDATE plan_versions SET status='active' WHERE id='starter-v1';
CREATE TABLE billing_customers (
 org_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 customer_id TEXT NOT NULL UNIQUE,
 subscription_id TEXT UNIQUE,
 status TEXT NOT NULL DEFAULT 'none',
 price_id TEXT,
 current_period_end INTEGER,
 cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
 event_created INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL
);
CREATE TABLE billing_prices (
 price_id TEXT PRIMARY KEY,
 plan_version_id TEXT NOT NULL REFERENCES plan_versions(id),
 livemode INTEGER NOT NULL CHECK(livemode IN (0,1))
);
CREATE TABLE billing_events (
 event_id TEXT PRIMARY KEY,
 event_type TEXT NOT NULL,
 processed_at INTEGER NOT NULL
);

CREATE TABLE billing_checkout_locks (
 org_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 token TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
