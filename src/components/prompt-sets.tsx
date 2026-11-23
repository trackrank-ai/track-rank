import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export type PromptSet = { id: string; name: string; workspace_id: string; member_count: number };

export function PromptSets({ org, workspace, workspaceNames, sets, activeSet, onFilter }: {
  org: string;
  workspace: string;
  workspaceNames: Record<string, string>;
  sets: PromptSet[];
  activeSet?: string;
  onFilter: (set: string) => void;
}) {
  const current = sets.find(set => set.id === activeSet);
  return <div className="app-inline-form">
    <label className="app-field"><span>Filter by tracking set</span>
      <select value={activeSet ?? ""} onChange={event => onFilter(event.target.value)}>
        <option value="">All questions</option>
        {activeSet && !current && <option value={activeSet}>Selected tracking set</option>}
        {sets.map(set => <option key={set.id} value={set.id}>
          {set.name}{workspace === "all" ? ` · ${workspaceNames[set.workspace_id]}` : ""}
        </option>)}
      </select>
    </label>
    {current && <Button asChild variant="outline" size="sm">
      <Link to="/app" search={{ org, workspace: current.workspace_id, tab: "tracking", set: current.id, trackingView: "overview" }}>Open tracking set</Link>
    </Button>}
  </div>;
}
