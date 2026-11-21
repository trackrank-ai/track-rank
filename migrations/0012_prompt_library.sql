CREATE INDEX prompts_workspace_history
  ON prompts(org_id, workspace_id, created_at DESC, id DESC);

CREATE INDEX schedules_active_prompt
  ON schedules(org_id, prompt_id) WHERE enabled=1;
