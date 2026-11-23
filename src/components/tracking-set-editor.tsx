import { Link } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { BulkPageNavigation, BulkSelection, changeSelection, useBulkPages } from "@/components/bulk-selection";
import type { PromptSet } from "@/components/prompt-sets";
import type { AppSearch } from "@/lib/app-location";

type Row = Record<string, any>;
type Read = (path: string, signal: AbortSignal) => Promise<Row>;
type Write = (path: string, method: string, data?: unknown) => Promise<unknown>;
type Selection = Map<string, Row>;
type Destination = "questions" | "write";
type Finish = (set: string, workspace: string, destination: Destination) => void;
const PAGE_SIZE = 500;

export function selectionSummary(selected: Selection) {
  const count = new Set([...selected.values()].map(row => row.question_id)).size;
  return `${count.toLocaleString()} ${count === 1 ? "question" : "questions"} · ${selected.size.toLocaleString()} engine ${selected.size === 1 ? "variant" : "variants"} selected`;
}

function MembershipForm({ selection, workspace, sets, pinned, create, request, finish, pending = false, children }: {
  selection: Selection; workspace: string; sets?: PromptSet[]; pinned?: PromptSet; create?: boolean;
  request: Write; finish: Finish; pending?: boolean; children?: ReactNode;
}) {
  const [choice, setChoice] = useState(pinned?.id ?? (create || !sets?.length ? ":new" : ""));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Retain the newly created set when a later membership page fails so a retry adds to the same set.
  const created = useRef<string | undefined>(undefined);
  const creating = choice === ":new";
  const valid = workspace && choice && (!creating || name.trim()) && !busy && !pending;
  async function save(action: "add" | "remove", destination: Destination) {
    if (!valid) return;
    setBusy(true);
    setError("");
    const ids = [...selection.keys()];
    let setId = creating ? created.current : choice;
    try {
      let offset = 0;
      if (!setId) {
        const result = await request("/prompt-sets", "POST", {
          workspace_id: workspace, name: name.trim(), prompt_ids: ids.slice(0, PAGE_SIZE),
        }) as { id: string };
        created.current = setId = result.id;
        offset = PAGE_SIZE;
      }
      for (; offset < ids.length; offset += PAGE_SIZE) {
        await request(`/prompt-sets/${setId}/members`, "PATCH", { action, prompt_ids: ids.slice(offset, offset + PAGE_SIZE) });
      }
      finish(setId, workspace, destination);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save tracking set.");
    } finally {
      setBusy(false);
    }
  }
  return <form className="form-stack" onSubmit={event => {
    event.preventDefault();
    const intent = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
    void save(intent === "remove" ? "remove" : "add", "questions");
  }}>
    {!pinned && !create && <label className="app-field"><span>Tracking set</span>
      <select aria-label="Tracking set" value={choice} onChange={e => setChoice(e.target.value)} disabled={busy || !!created.current} required>
        <option value="" disabled>Choose a tracking set</option>
        {sets?.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}
        <option value=":new">Create a tracking set</option>
      </select>
    </label>}
    {creating && <label className="app-field"><span>Tracking set name</span>
      <input value={name} onChange={e => setName(e.target.value)} maxLength={100} disabled={busy || !!created.current} required />
    </label>}
    {create && <div><Button type="button" variant="outline" onClick={() => void save("add", "write")} disabled={!valid}>Create set and write new questions</Button></div>}
    {children}
    <div className="form-actions">
      <Button disabled={!valid || (!creating && !selection.size)}>
        {creating ? "Create tracking set" : "Add selected questions"}
      </Button>
      {!pinned && !creating && !create && <Button variant="outline" value="remove" disabled={!valid || !selection.size}>Remove from tracking set</Button>}
    </div>
    {error && <p role="alert">{error}</p>}
  </form>;
}

export function SelectionSetAction({ selection, sets, request, finish, pending }: {
  selection: Selection; sets: PromptSet[]; request: Write; finish: Finish; pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const workspaceIds = new Set([...selection.values()].map(row => String(row.workspace_id)));
  const workspace = workspaceIds.size === 1 ? [...workspaceIds][0] : undefined;
  return <div className="form-stack">
    <Button variant="outline" type="button" aria-expanded={open} onClick={() => setOpen(current => !current)}>Add to tracking set</Button>
    {open && (workspace
      ? <MembershipForm key={workspace} workspace={workspace} selection={selection} sets={sets.filter(set => set.workspace_id === workspace)}
          request={request} finish={finish} pending={pending} />
      : <p role="status">Choose questions from one workspace to change tracking set membership.</p>)}
  </div>;
}

export function TrackingSetEditor({ org, workspace, workspaces, pinned, engines, read, request, finish, changeWorkspace }: {
  org: string; workspace: string; workspaces: Row[]; pinned?: PromptSet; engines: Record<string, string>;
  read: Read; request: Write; finish: Finish; changeWorkspace: (workspace: string) => void;
}) {
  const [selection, setSelection] = useState<Selection>(new Map());
  const [query, setQuery] = useState("");
  const scope = new URLSearchParams({ view: "library", workspace, q: query });
  if (pinned) scope.set("outside_set", pinned.id);
  const pages = useBulkPages(workspace ? "/prompts?" + scope : null, "prompts", read, pinned?.id);
  const rows = pages.current?.rows ?? [];
  const change = (items: Row[], checked: boolean) => setSelection(current => changeSelection(current, items, checked));
  const back: AppSearch = { org, workspace: workspace || "all", tab: "tracking", set: pinned?.id, trackingView: pinned ? "questions" : undefined };
  return <section className="form-stack">
    <div><Link className="small-link" to="/app" search={back}>{pinned ? "Back to tracking set" : "Back to tracking sets"}</Link></div>
    <div className="app-page-heading"><div><h1>{pinned ? `Add questions to ${pinned.name}` : "Create tracking set"}</h1>
      {pinned && <p>{workspaces.find(w => w.id === workspace)?.name}</p>}</div></div>
    {!pinned && <label className="app-field"><span>Workspace</span>
      <select aria-label="Workspace" value={workspace} onChange={e => changeWorkspace(e.target.value)}>
        <option value="" disabled>Choose a workspace</option>
        {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </label>}
    {workspace && <MembershipForm workspace={workspace} pinned={pinned} create={!pinned} selection={selection} request={request}
      finish={finish} pending={pages.selecting}>
      <div className="tracking-empty form-stack">
        <div className="panel-title"><h2>Choose saved questions</h2>
          {pinned && <Link className="small-link" to="/app"
            search={{ org, workspace, tab: "prompts", promptView: "create", set: pinned.id, trackingView: "questions" }}>Write new questions</Link>}
        </div>
        <label className="app-field"><span>Search questions</span><input type="search" maxLength={200} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} /></label>
        <BulkSelection rows={rows} selected={selection} pages={pages} members={row => row.variants}
          selectionSummary={selectionSummary(selection)} onChange={change} />
        {pages.error ? <p role="alert">{pages.error}</p> : !pages.current ? <p role="status">Loading questions…</p> :
          rows.length ? <ul className="tracking-picker">{rows.map(row => <li key={row.id}>
            <label><input type="checkbox" checked={row.variants.every((v: Row) => selection.has(v.id))}
              onChange={e => change(row.variants, e.target.checked)} />
              <span>{row.text}<small>{row.variants.map((v: Row) => engines[v.engine] ?? v.engine).join(" · ")}</small></span></label>
          </li>)}</ul> : <p>{query ? "No questions match your search." : pinned ? "All saved questions are already in this set, or the workspace has no saved questions." : "No saved questions in this workspace yet."}</p>}
        <BulkPageNavigation pages={pages} label="Saved question pages" />
      </div>
    </MembershipForm>}
  </section>;
}
