import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

export type PromptSet = { id: string; name: string; workspace_id: string; member_count: number };
const MAX_MEMBERS_PER_REQUEST = 500;

export function PromptSets({ org, workspace, workspaceNames, sets, activeSet, selection, canWrite, request, onFilter, onChange }: {
  org: string;
  workspace: string;
  workspaceNames: Record<string, string>;
  sets: PromptSet[];
  activeSet?: string;
  selection: Map<string, Record<string, any>>;
  canWrite: boolean;
  request: (path: string, method: string, data?: unknown) => Promise<unknown>;
  onFilter: (set: string) => void;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const workspaces = new Set([...selection.values()].map(p => p.workspace_id));
  const selectionWorkspace = workspaces.size === 1 ? [...workspaces][0] : "";
  const compatible = sets.filter(set => set.workspace_id === selectionWorkspace);
  const promptIds = [...selection.keys()];
  const current = sets.find(set => set.id === activeSet);
  async function mutate(operation: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      setMessage(await operation());
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update prompt sets");
    } finally {
      onChange();
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>, operation: (data: FormData, action: string) => Promise<string>) {
    event.preventDefault();
    const form = event.currentTarget;
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "";
    void mutate(() => operation(new FormData(form), action));
  }
  async function updateMembers(id: string, action: string, start = 0) {
    for (let offset = start; offset < promptIds.length; offset += MAX_MEMBERS_PER_REQUEST) {
      await request(`/prompt-sets/${id}/members`, "PATCH", {
        action, prompt_ids: promptIds.slice(offset, offset + MAX_MEMBERS_PER_REQUEST),
      });
      setMessage(`Processed ${Math.min(offset + MAX_MEMBERS_PER_REQUEST, promptIds.length)} of ${promptIds.length} selected prompts.`);
    }
  }
  return <details className="advanced-settings">
    <summary>Prompt sets{activeSet ? ` · ${current?.name ?? "Set selected"}` : ""}</summary>
    <div className="form-stack">
      <label className="app-field"><span>Filter by prompt set</span>
        <select value={activeSet ?? ""} onChange={event => onFilter(event.target.value)}>
          <option value="">All prompts</option>
          {activeSet && !current && <option value={activeSet}>Selected set</option>}
          {sets.map(set => <option key={set.id} value={set.id}>
            {set.name}{workspace === "all" ? ` · ${workspaceNames[set.workspace_id]}` : ""} ({set.member_count})
          </option>)}
        </select>
      </label>
      {current && <div className="app-inline-form">
        <Button asChild variant="outline" size="sm">
          <Link to="/app" search={{ org, workspace: current.workspace_id, tab: "overview", set: current.id }}>View performance</Link>
        </Button>
        {canWrite && <>
          <form key={current.id + current.name} className="app-inline-form" onSubmit={event => submit(event, async data => {
            await request(`/prompt-sets/${current.id}`, "PATCH", { name: data.get("name") });
            return "Prompt set renamed.";
          })}>
            <label className="app-field"><span>Set name</span><input name="name" defaultValue={current.name} maxLength={100} required /></label>
            <Button disabled={busy} size="sm" variant="outline">Rename</Button>
          </form>
          <Button disabled={busy} size="sm" variant="outline" onClick={() => {
            if (confirm(`Delete ${current.name}? Its prompts, schedules and collected results will stay available.`))
              void mutate(async () => {
                await request(`/prompt-sets/${current.id}`, "DELETE");
                onFilter("");
                return "Prompt set deleted.";
              });
          }}>Delete set</Button>
        </>}
      </div>}
      {canWrite && selectionWorkspace && <>
        <form className="app-inline-form" onSubmit={event => submit(event, async data => {
          const result = await request("/prompt-sets", "POST", {
            workspace_id: selectionWorkspace, name: data.get("name"), prompt_ids: promptIds.slice(0, MAX_MEMBERS_PER_REQUEST),
          }) as { id: string };
          setMessage(`Set created with ${Math.min(promptIds.length, MAX_MEMBERS_PER_REQUEST)} prompts.`);
          await updateMembers(result.id, "add", MAX_MEMBERS_PER_REQUEST);
          onFilter(result.id);
          return `Set created with ${promptIds.length} prompts.`;
        })}>
          <label className="app-field"><span>New set name</span><input name="name" maxLength={100} required /></label>
          <Button disabled={busy} size="sm" variant="outline">Create set from {promptIds.length} selected</Button>
        </form>
        {compatible.length > 0 && <form className="app-inline-form" onSubmit={event => submit(event, async (data, action) => {
          await updateMembers(String(data.get("set")), action);
          return action === "remove" ? "Selected prompts removed from set." : "Selected prompts added to set.";
        })}>
          <label className="app-field"><span>Set for selected prompts</span>
            <select key={current?.id} name="set" defaultValue={current?.id}>
              {compatible.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}
            </select>
          </label>
          <Button disabled={busy} size="sm" variant="outline" value="add">Add selected</Button>
          <Button disabled={busy} size="sm" variant="outline" value="remove">Remove selected</Button>
        </form>}
      </>}
      {canWrite && workspaces.size > 1 && <p className="data-note">Select prompts from one workspace to change set membership.</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  </details>;
}
