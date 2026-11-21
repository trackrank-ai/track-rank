-- Remove retired entitlements from every revision while preserving its price,
-- rate limits, monthly run allowance, and existing Stripe Price mapping.
DROP TRIGGER plan_revision_immutable;
UPDATE plan_versions SET limits_json=json_remove(limits_json, '$.api_per_month', '$.concurrent_runs');
CREATE TRIGGER plan_revision_immutable BEFORE UPDATE OF id,family,name,price_cents,currency,interval,limits_json,created_at ON plan_versions
BEGIN SELECT RAISE(ABORT,'Create a new plan version instead of editing an existing revision'); END;

DROP TABLE monthly_api_usage;
