ALTER TABLE schedules ADD COLUMN batch_id TEXT;
ALTER TABLE schedules ADD COLUMN batch_name TEXT NOT NULL DEFAULT '';
ALTER TABLE schedules ADD COLUMN times_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE schedules ADD COLUMN repetitions INTEGER NOT NULL DEFAULT 1 CHECK(repetitions BETWEEN 1 AND 10);
CREATE TABLE run_batches(org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,batch_key TEXT NOT NULL,payload_hash TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(org_id,batch_key));
