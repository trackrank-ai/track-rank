import { z } from "zod";
import { HttpError, one, required, type Env } from "./types";

export const promptQuestionText = z.string().trim().min(3).max(700);
export const renamePromptQuestionSchema = z.object({ text: promptQuestionText }).strict();

export async function handleQuestionConflict<T>(write: Promise<T>) {
  try {
    return await write;
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: prompt_questions.org_id, prompt_questions.workspace_id, prompt_questions.text")) {
      throw new HttpError(409, "This workspace already has a prompt with that wording.");
    }
    throw error;
  }
}

export async function renamePromptQuestion(env: Env, org: string, id: string, text: string) {
  const question = await handleQuestionConflict(one<{ id: string; text: string }>(env, `
    UPDATE prompt_questions SET text=?
    WHERE org_id=? AND id=? AND EXISTS (
      SELECT 1 FROM prompt_engines WHERE question_id=prompt_questions.id AND archived_at IS NULL
    ) RETURNING id,text`, text, org, id));
  return required(question, "Prompt question not found");
}
