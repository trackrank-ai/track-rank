ALTER TABLE prompts ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'
  CONSTRAINT prompt_tags_valid CHECK (json_type(tags) = 'array' AND json_array_length(tags) <= 20);
