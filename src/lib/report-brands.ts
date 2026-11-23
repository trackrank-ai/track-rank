export type ReportBrand = { id: string; name: string; kind?: string; domain?: string };
export type RecordedBrand = { id: string; name: string; workspace_id: string };
type Workspace = { id: string; name: string; brand_ids?: string };

export function reportBrandLabels(
  current: ReportBrand[], recorded: RecordedBrand[], workspaces: Workspace[],
): ReportBrand[] {
  const options = new Map(current.map(brand => [brand.id, brand]));
  const historical = new Set<string>();
  const assignments = new Map<string, Set<string>>();
  function assign(id: string, workspace: string) {
    const scopes = assignments.get(id) ?? new Set<string>();
    scopes.add(workspace);
    assignments.set(id, scopes);
  }
  for (const workspace of workspaces) {
    for (const id of JSON.parse(workspace.brand_ids || "[]") as string[]) assign(id, workspace.name);
  }
  for (const row of recorded) {
    if (!options.has(row.id)) {
      options.set(row.id, { id: row.id, name: row.name });
      historical.add(row.id);
    }
    const workspace = workspaces.find(item => item.id === row.workspace_id);
    if (workspace) assign(row.id, workspace.name);
  }
  const counts = new Map<string, number>();
  for (const brand of options.values()) {
    const name = brand.name.toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const labeled = [...options.values()].map(brand => {
    if (counts.get(brand.name.toLowerCase()) === 1) return brand;
    const scopes = [...(assignments.get(brand.id) ?? [])].sort();
    const label = [brand.name, scopes.join(", ") || "Organization", historical.has(brand.id) ? "Recorded brand" : brand.domain];
    return { ...brand, name: label.filter(Boolean).join(" · ") };
  });
  // Two separate records can share both a name and a workspace. Give only those
  // still-identical labels a stable record qualifier.
  const labelIds = new Map<string, string[]>();
  for (const brand of labeled) {
    const key = brand.name.toLowerCase();
    const ids = labelIds.get(key) ?? [];
    ids.push(brand.id);
    labelIds.set(key, ids);
  }
  return labeled.map(brand => {
    const ids = labelIds.get(brand.name.toLowerCase())!;
    if (ids.length === 1) return brand;
    const ordinal = [...ids].sort().indexOf(brand.id) + 1;
    return { ...brand, name: `${brand.name} · Record ${ordinal}` };
  });
}
