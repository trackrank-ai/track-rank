-- New revisions only: preserve all existing assignments and Stripe mappings.
INSERT INTO plan_versions(id,family,name,price_cents,currency,interval,status,limits_json,created_at) VALUES
('starter-v2','starter','Starter',1000,'usd','month','active','{"api_per_minute":120,"provider_per_minute":10,"runs_per_month":10000,"searchable_history_days":30}',CAST(unixepoch('subsec')*1000 AS INTEGER)),
('agency-v1','agency','Agency',3900,'usd','month','active','{"api_per_minute":120,"provider_per_minute":10,"runs_per_month":60000,"searchable_history_days":90}',CAST(unixepoch('subsec')*1000 AS INTEGER)),
('scale-v1','scale','Scale',9900,'usd','month','active','{"api_per_minute":120,"provider_per_minute":10,"runs_per_month":250000,"searchable_history_days":180}',CAST(unixepoch('subsec')*1000 AS INTEGER));
