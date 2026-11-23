import { z } from "zod";
import { setId } from "./prompt-sets";
import { brandSnapshot, brandSnapshotId, searchableHistoryWhere } from "./run-history";
import { all, HttpError, type Env } from "./types";
import type { RecordedBrand } from "../lib/report-brands";

export const reportBrandIds = z.array(setId).min(1).max(3);

// Selected historical identities are independent of the intersection of a report’s brands.
// Resolve only the requested names, within the caller's tenant and searchable history.
export async function recordedBrandNames(env: Env, org: string, params: URLSearchParams) {
  const ids = reportBrandIds.safeParse(params.get("ids")?.split(","));
  if (!ids.success) throw new HttpError(400, "Choose one to three brand IDs");
  const workspace = params.get("workspace");
  const scope = await searchableHistoryWhere(env, org, new URLSearchParams(workspace ? { workspace } : {}));
  const rows = await all<RecordedBrand>(env, `WITH snapshots AS (
      SELECT ${brandSnapshotId} AS brand_id,
        CASE WHEN snapshot.type='object' THEN json_extract(snapshot.value,'$.name') END AS name,
        runs.workspace_id, runs.created_at, runs.id AS run_id
      FROM runs, ${brandSnapshot} AS snapshot
      WHERE ${scope.conditions.join(" AND ")} AND ${brandSnapshotId} IN (SELECT value FROM json_each(?))
    ), named AS (
      SELECT *,row_number() OVER (PARTITION BY brand_id,workspace_id ORDER BY created_at DESC,run_id DESC,name) AS sequence
      FROM snapshots WHERE typeof(name)='text' AND trim(name)<>''
    )
    SELECT brand_id AS id,name,workspace_id FROM named WHERE sequence=1 ORDER BY created_at DESC,run_id DESC,brand_id`,
    ...scope.bindings, JSON.stringify(ids.data));
  return { brands: rows };
}
