-- Successful cron heartbeat is independent of customer billing records.
CREATE TABLE operations_health (name TEXT PRIMARY KEY, succeeded_at INTEGER NOT NULL);
