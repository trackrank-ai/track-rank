ALTER TABLE prompt_questions ADD COLUMN question_type TEXT
  CHECK(question_type IS NULL OR question_type IN ('discovery','comparison','branded'));
