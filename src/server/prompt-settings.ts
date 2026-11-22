import { z } from "zod";
import { bulkPromptIdsSchema, selectedRows } from "./bulk";
import type { Engine } from "./provider";
import { assertProviderOptions } from "./provider-options";
import { promptTags } from "./prompt-tags";
import { HttpError, now, type Env } from "./types";
import { requireWorkspaceBrand } from "./workspace-brands";

const settings = {
  mode: z.enum(["standard", "priority", "live"]).optional(),
  location_name: z.string().trim().min(2).max(200).optional(),
  language_code: z.string().min(2).max(20).optional(),
  brand_id: z.string().min(1).max(100).nullable().optional(),
  tags: promptTags.optional(),
};

export const promptSettingsSchema = z.strictObject(settings);
export const bulkPromptSettingsSchema = bulkPromptIdsSchema.extend(settings);

export async function updatePromptSettings(env: Env, org: string, { ids, ...changes }: z.output<typeof bulkPromptSettingsSchema>) {
  const { mode, location_name, language_code, brand_id, tags } = changes;
  if (Object.values(changes).every(value => value === undefined)) {
    throw new HttpError(400, "Choose at least one prompt setting to update");
  }
  const rows = await selectedRows(env, org, "prompts", ids);
  if (location_name !== undefined || language_code !== undefined) {
    for (const row of rows) {
      await assertProviderOptions([row.engine as Engine], location_name ?? String(row.location_name), language_code ?? String(row.language_code));
    }
  }
  if (brand_id) {
    for (const workspace of new Set(rows.map(row => String(row.workspace_id)))) {
      await requireWorkspaceBrand(env, org, workspace, brand_id);
    }
  }

  const updatedAt = now();
  await env.DB.batch(rows.map(row => env.DB.prepare(
    `UPDATE prompts SET mode=coalesce(?,mode),location_name=coalesce(?,location_name),
      language_code=coalesce(?,language_code),brand_id=CASE WHEN ? THEN ? ELSE brand_id END,
      tags=coalesce(?,tags),updated_at=? WHERE org_id=? AND id=? AND archived_at IS NULL`,
  ).bind(mode ?? null, location_name ?? null, language_code ?? null, Number(brand_id !== undefined),
    brand_id ?? null, tags === undefined ? null : JSON.stringify(tags), updatedAt, org, row.id)));
  return { updated: rows.length };
}
