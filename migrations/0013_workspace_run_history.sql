CREATE INDEX runs_workspace_history
  ON runs(org_id, workspace_id, created_at DESC, id DESC);
