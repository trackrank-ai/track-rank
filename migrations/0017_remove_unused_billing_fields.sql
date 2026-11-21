-- The application trial ledger and monthly run admission are the only active policies.
ALTER TABLE billing_customers DROP COLUMN trial_used;
ALTER TABLE organizations DROP COLUMN daily_run_ceiling;
ALTER TABLE organizations DROP COLUMN daily_run_limit;
