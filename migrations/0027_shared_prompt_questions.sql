-- Keep each existing engine ID so scheduled checks, run history and receipts retain their references.
CREATE TABLE prompt_questions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  text TEXT NOT NULL,
  UNIQUE(org_id, workspace_id, text),
  FOREIGN KEY(org_id, workspace_id) REFERENCES workspaces(org_id, id) ON DELETE CASCADE
);

INSERT INTO prompt_questions(id, org_id, workspace_id, text)
SELECT lower(hex(randomblob(16))), org_id, workspace_id, text
FROM prompts GROUP BY org_id, workspace_id, text;

ALTER TABLE prompts RENAME TO prompt_engines;
ALTER TABLE prompt_engines ADD COLUMN question_id TEXT REFERENCES prompt_questions(id);
UPDATE prompt_engines
SET question_id=(
  SELECT q.id FROM prompt_questions q
  WHERE q.org_id=prompt_engines.org_id AND q.workspace_id=prompt_engines.workspace_id AND q.text=prompt_engines.text
);
ALTER TABLE prompt_engines DROP COLUMN text;
CREATE INDEX prompt_engines_question ON prompt_engines(question_id, archived_at);

CREATE TRIGGER prompt_engines_require_question_on_insert
BEFORE INSERT ON prompt_engines
WHEN NOT EXISTS (
  SELECT 1 FROM prompt_questions q WHERE q.id=NEW.question_id AND q.org_id=NEW.org_id AND q.workspace_id=NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'Invalid prompt question scope');
END;

CREATE TRIGGER prompt_engines_require_question_on_update
BEFORE UPDATE OF question_id, org_id, workspace_id ON prompt_engines
WHEN NOT EXISTS (
  SELECT 1 FROM prompt_questions q WHERE q.id=NEW.question_id AND q.org_id=NEW.org_id AND q.workspace_id=NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'Invalid prompt question scope');
END;

-- Engine-based collection operations read the current question through this projection.
CREATE VIEW prompts AS
SELECT e.*, q.text FROM prompt_engines e JOIN prompt_questions q ON q.id=e.question_id;

CREATE TRIGGER insert_prompt_engine
INSTEAD OF INSERT ON prompts
BEGIN
  INSERT INTO prompt_questions(id, org_id, workspace_id, text)
  VALUES(lower(hex(randomblob(16))), NEW.org_id, NEW.workspace_id, NEW.text)
  ON CONFLICT(org_id, workspace_id, text) DO NOTHING;

  INSERT INTO prompt_engines(id, org_id, workspace_id, brand_id, location_name, language_code,
    engine, mode, created_at, updated_at, archived_at, tags, question_id)
  SELECT NEW.id, NEW.org_id, NEW.workspace_id, NEW.brand_id, coalesce(NEW.location_name, 'United States'),
    coalesce(NEW.language_code, 'en'), coalesce(NEW.engine, 'chatgpt'), coalesce(NEW.mode, 'standard'),
    NEW.created_at, NEW.updated_at, NEW.archived_at, coalesce(NEW.tags, '[]'), q.id
  FROM prompt_questions q
  WHERE q.org_id=NEW.org_id AND q.workspace_id=NEW.workspace_id AND q.text=NEW.text;
END;

CREATE TRIGGER update_prompt_engine
INSTEAD OF UPDATE ON prompts
BEGIN
  UPDATE prompt_questions SET text=NEW.text
  WHERE id=OLD.question_id AND NEW.workspace_id=OLD.workspace_id AND NEW.text<>OLD.text;

  INSERT INTO prompt_questions(id, org_id, workspace_id, text)
  SELECT lower(hex(randomblob(16))), OLD.org_id, NEW.workspace_id, NEW.text
  WHERE NEW.workspace_id<>OLD.workspace_id
  ON CONFLICT(org_id, workspace_id, text) DO NOTHING;

  UPDATE prompt_engines SET workspace_id=NEW.workspace_id, brand_id=NEW.brand_id,
    location_name=NEW.location_name, language_code=NEW.language_code, engine=NEW.engine,
    mode=NEW.mode, updated_at=NEW.updated_at, archived_at=NEW.archived_at, tags=NEW.tags,
    question_id=CASE WHEN NEW.workspace_id=OLD.workspace_id THEN OLD.question_id ELSE (
      SELECT id FROM prompt_questions WHERE org_id=OLD.org_id AND workspace_id=NEW.workspace_id AND text=NEW.text
    ) END
  WHERE id=OLD.id AND org_id=OLD.org_id;

  DELETE FROM prompt_questions WHERE id=OLD.question_id AND NEW.workspace_id<>OLD.workspace_id
    AND NOT EXISTS(SELECT 1 FROM prompt_engines WHERE question_id=OLD.question_id);
END;
