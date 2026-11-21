import { all, HttpError, one, type Env } from "./types";

export function trackedWorkspaceBrands(env: Env, org: string, workspace: string) {
  return all(env,
    `SELECT b.id,b.name,b.domain,b.aliases,wb.kind FROM workspace_brands wb
     JOIN brands b ON b.org_id=wb.org_id AND b.id=wb.brand_id
     WHERE wb.org_id=? AND wb.workspace_id=? ORDER BY b.id`,
    org, workspace,
  );
}

export async function requireWorkspaceBrand(env: Env, org: string, workspace: string, brand?: string | null) {
  if (brand && !await one(env,
    "SELECT brand_id FROM workspace_brands WHERE org_id=? AND workspace_id=? AND brand_id=?",
    org, workspace, brand,
  )) throw new HttpError(404, "Brand is not tracked in this workspace");
}
