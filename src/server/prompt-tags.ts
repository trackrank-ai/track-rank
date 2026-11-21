import { z } from "zod";
import { MAX_PROMPT_TAGS, normalizePromptTag, validPromptTag } from "../lib/prompt-tags";
import { exec, HttpError, now, type Env, type Row } from "./types";

export const promptTag = z.string().transform(normalizePromptTag)
  .refine(validPromptTag, "Use tags of 1–50 characters without commas");
export const promptTags = z.array(promptTag).max(MAX_PROMPT_TAGS)
  .transform(tags => [...new Set(tags)].sort());

export const bulkPromptTagsSchema = z.object({
  ids: z.array(z.string().min(1).max(100)).min(1).max(100),
  action: z.enum(["add", "remove"]),
  tags: promptTags.refine(tags => tags.length > 0, "Enter at least one tag"),
}).strict();

export function decodePrompt(row: Row) {
  return { ...row, tags: JSON.parse(String(row.tags)) as string[] };
}

export async function updatePromptTags(env: Env, org: string, input: z.output<typeof bulkPromptTagsSchema>) {
  const ids = [...new Set(input.ids)];
  const operation = input.action === "add" ? "UNION" : "EXCEPT";
  let updated: number;
  try {
    const result = await exec(env, `
      WITH selected AS MATERIALIZED (
        SELECT id FROM prompts WHERE org_id=? AND archived_at IS NULL
        AND id IN (SELECT value FROM json_each(?))
      )
      UPDATE prompts SET tags=(
        SELECT json_group_array(value) FROM (
          SELECT value FROM json_each(prompts.tags) ${operation}
          SELECT value FROM json_each(?) ORDER BY value
        )
      ),updated_at=?
      WHERE org_id=? AND id IN (SELECT id FROM selected) AND (SELECT count(*) FROM selected)=?
    `, org, JSON.stringify(ids), JSON.stringify(input.tags), now(), org, ids.length);
    updated = result.meta.changes;
  } catch (error) {
    if (error instanceof Error && error.message.includes("prompt_tags_valid"))
      throw new HttpError(400, `Each prompt can have up to ${MAX_PROMPT_TAGS} tags`);
    throw error;
  }
  if (updated !== ids.length) throw new HttpError(404, "One or more prompts are not available in this organization");
  return { updated };
}
