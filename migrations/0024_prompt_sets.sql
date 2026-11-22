CREATE UNIQUE INDEX prompts_membership_workspace ON prompts(org_id, workspace_id, id);

CREATE TABLE prompt_sets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(org_id, workspace_id, id),
  FOREIGN KEY(org_id, workspace_id) REFERENCES workspaces(org_id, id) ON DELETE CASCADE
);

CREATE TABLE prompt_set_members (
  org_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  set_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  PRIMARY KEY(org_id, workspace_id, set_id, prompt_id),
  FOREIGN KEY(org_id, workspace_id, set_id) REFERENCES prompt_sets(org_id, workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY(org_id, workspace_id, prompt_id) REFERENCES prompts(org_id, workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX prompt_set_members_prompt ON prompt_set_members(org_id, workspace_id, prompt_id);

CREATE TRIGGER clear_prompt_set_memberships
BEFORE UPDATE OF workspace_id, archived_at ON prompts
WHEN OLD.workspace_id <> NEW.workspace_id OR (OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL)
BEGIN
  DELETE FROM prompt_set_members WHERE org_id=OLD.org_id AND workspace_id=OLD.workspace_id AND prompt_id=OLD.id;
END;

CREATE TRIGGER delete_archived_workspace_sets
AFTER UPDATE OF archived_at ON workspaces
WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL
BEGIN
  DELETE FROM prompt_sets WHERE org_id=NEW.org_id AND workspace_id=NEW.id;
END;
