-- Plan revisions are immutable; retirement only controls NEW assignments.
CREATE TABLE plan_versions (
  id TEXT PRIMARY KEY,
  family TEXT NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK(price_cents>=0),
  currency TEXT NOT NULL DEFAULT 'usd',
  interval TEXT NOT NULL DEFAULT 'month' CHECK(interval IN ('month','year')),
  status TEXT NOT NULL CHECK(status IN ('draft','active','retired')),
  limits_json TEXT NOT NULL CHECK(json_valid(limits_json)),
  created_at INTEGER NOT NULL
);
INSERT INTO plan_versions VALUES
('beta-v1','beta','Beta',0,'usd','month','active','{"api_per_minute":120,"api_per_month":1000000000,"provider_per_minute":10,"runs_per_month":1000000,"concurrent_runs":3}',0),
('starter-v1','starter','Starter',1000,'usd','month','draft','{"api_per_minute":120,"api_per_month":200000,"provider_per_minute":10,"runs_per_month":6000,"concurrent_runs":3}',0),
('pro-v1','pro','Pro',3000,'usd','month','draft','{"api_per_minute":360,"api_per_month":600000,"provider_per_minute":30,"runs_per_month":18000,"concurrent_runs":9}',0);
CREATE TRIGGER plan_revision_immutable BEFORE UPDATE OF id,family,name,price_cents,currency,interval,limits_json,created_at ON plan_versions
BEGIN SELECT RAISE(ABORT,'Create a new plan version instead of editing an existing revision'); END;
CREATE TRIGGER plan_revision_no_delete BEFORE DELETE ON plan_versions
BEGIN SELECT RAISE(ABORT,'Retire plan versions instead of deleting them'); END;
CREATE TABLE organization_plans (
  org_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  plan_version_id TEXT NOT NULL REFERENCES plan_versions(id),
  assigned_at INTEGER NOT NULL,
  reason TEXT NOT NULL
);
INSERT INTO organization_plans SELECT id,'beta-v1',created_at,'Existing beta organization' FROM organizations;
CREATE TRIGGER plan_assignment_active_insert BEFORE INSERT ON organization_plans
WHEN NOT EXISTS(SELECT 1 FROM plan_versions WHERE id=NEW.plan_version_id AND status='active')
BEGIN SELECT RAISE(ABORT,'New assignments require an active plan version'); END;
CREATE TRIGGER plan_assignment_active_update BEFORE UPDATE OF plan_version_id ON organization_plans
WHEN NEW.plan_version_id<>OLD.plan_version_id AND NOT EXISTS(SELECT 1 FROM plan_versions WHERE id=NEW.plan_version_id AND status='active')
BEGIN SELECT RAISE(ABORT,'New assignments require an active plan version'); END;
CREATE TABLE plan_assignment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  previous_version_id TEXT REFERENCES plan_versions(id),
  plan_version_id TEXT NOT NULL REFERENCES plan_versions(id),
  assigned_at INTEGER NOT NULL,
  reason TEXT NOT NULL
);
INSERT INTO plan_assignment_history(org_id,plan_version_id,assigned_at,reason)
SELECT org_id,plan_version_id,assigned_at,reason FROM organization_plans;
CREATE TRIGGER plan_assignment_insert AFTER INSERT ON organization_plans
BEGIN INSERT INTO plan_assignment_history(org_id,plan_version_id,assigned_at,reason) VALUES(NEW.org_id,NEW.plan_version_id,NEW.assigned_at,NEW.reason); END;
CREATE TRIGGER plan_assignment_update AFTER UPDATE OF plan_version_id ON organization_plans
WHEN NEW.plan_version_id<>OLD.plan_version_id
BEGIN INSERT INTO plan_assignment_history(org_id,previous_version_id,plan_version_id,assigned_at,reason) VALUES(NEW.org_id,OLD.plan_version_id,NEW.plan_version_id,NEW.assigned_at,NEW.reason); END;
CREATE TABLE monthly_api_usage (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  operations INTEGER NOT NULL,
  PRIMARY KEY(org_id,month)
);
-- Preserve the customer's existing daily safety setting without the legacy 100/day ceiling.
-- Keep the old column for rollback compatibility; new code uses this explicit ceiling.
ALTER TABLE organizations ADD COLUMN daily_run_ceiling INTEGER NOT NULL DEFAULT 20 CHECK(daily_run_ceiling BETWEEN 1 AND 1000000);
UPDATE organizations SET daily_run_ceiling=daily_run_limit;
