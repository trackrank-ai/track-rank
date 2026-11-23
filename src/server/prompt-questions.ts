import { questionTypes } from "../lib/question-type";
import { all, HttpError, type Env } from "./types";
import { z } from "zod";

export const promptQuestionText = z.string().trim().min(3).max(700);

export const questionTypePatch = z.object({
  ids: z.array(z.string().min(1).max(100)).min(1).max(100),
  question_type: z.enum(questionTypes).nullable(),
}).strict();

export const questionTypeMatch = "EXISTS(SELECT 1 FROM prompt_questions qt WHERE qt.org_id=p.org_id AND qt.id=p.question_id AND qt.question_type=?)";

// The guard and update use the same statement snapshot. A foreign, archived or
// concurrently removed variant invalidates the entire request.
export async function classifyQuestions(env: Env, org: string, input: z.infer<typeof questionTypePatch>) {
  const ids = [...new Set(input.ids)];
  const rows = await all(env, `WITH selected AS MATERIALIZED (
    SELECT question_id FROM prompt_engines WHERE org_id=? AND archived_at IS NULL AND id IN (SELECT value FROM json_each(?))
  ) UPDATE prompt_questions SET question_type=? WHERE org_id=? AND id IN (SELECT question_id FROM selected)
    AND (SELECT count(*) FROM selected)=? RETURNING id`,
    org, JSON.stringify(ids), input.question_type, org, ids.length);
  if (!rows.length) throw new HttpError(404, "One or more selected variants are unavailable");
  return { updated: rows.length };
}
