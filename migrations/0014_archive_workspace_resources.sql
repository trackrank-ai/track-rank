ALTER TABLE prompts ADD COLUMN archived_at INTEGER;
ALTER TABLE workspaces ADD COLUMN archived_at INTEGER;

CREATE TRIGGER prompts_require_active_workspace_on_insert
BEFORE INSERT ON prompts
WHEN EXISTS (SELECT 1 FROM workspaces WHERE org_id=NEW.org_id AND id=NEW.workspace_id AND archived_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'Workspace is deleted');
END;

CREATE TRIGGER prompts_require_active_workspace_on_move
BEFORE UPDATE OF workspace_id ON prompts
WHEN NEW.workspace_id<>OLD.workspace_id AND EXISTS (
  SELECT 1 FROM workspaces WHERE org_id=NEW.org_id AND id=NEW.workspace_id AND archived_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'Workspace is deleted');
END;

CREATE TRIGGER schedules_require_active_prompt
BEFORE INSERT ON schedules
WHEN EXISTS (SELECT 1 FROM prompts WHERE org_id=NEW.org_id AND id=NEW.prompt_id AND archived_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'Prompt is deleted');
END;
