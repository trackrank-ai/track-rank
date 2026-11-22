import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

type Run = { id: string; workspace_id: string; prompt_text: string; engine: string; status: string; has_answer: number; has_organic?: number; error?: string };
type Batch = { requested: number; runs: Run[] };

const groups = [
  { id: "pending", label: "Pending", match: (run: Run) => ["queued", "submitted", "submitting"].includes(run.status) },
  { id: "failed", label: "Failed", match: (run: Run) => run.status === "failed" },
  { id: "uncertain", label: "Uncertain", match: (run: Run) => run.status === "uncertain" },
  { id: "no-answer", label: "Completed without an eligible AI answer", match: (run: Run) => run.status === "succeeded" && !run.has_answer },
  { id: "eligible", label: "Eligible AI answers", match: (run: Run) => run.status === "succeeded" && !!run.has_answer },
];

export function RunBatch({ org, workspace, batch, receipt, request, engines }: {
  org: string; workspace: string; batch: string; receipt?: string; engines: Record<string, string>;
  request: (path: string) => Promise<Record<string, unknown>>;
}) {
  const [data, setData] = useState<Batch>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let timer: number;
    async function load() {
      try {
        const result = await request("/runs/batches/" + batch) as Batch;
        if (!active) return;
        setData(result);
        setError("");
        if (result.runs.some(groups[0].match)) timer = window.setTimeout(load, 5000);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load this batch");
      }
    }
    void load();
    return () => { active = false; window.clearTimeout(timer); };
  }, [batch, request]);
  return <Card><CardContent className="form-stack">
    <h2>Collection batch</h2>
    {receipt && <Link to="/app" search={{ org, workspace, tab: "prompts", receipt }}>View save receipt</Link>}
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading collection batch…</p>}
    {data && <>
      <p aria-live="polite">{data.runs.length} of {data.requested} checks recorded.</p>
      <div className="app-inline-form">{groups.map(group => <a key={group.id} href={"#batch-" + group.id}>
        {group.label} ({data.runs.filter(group.match).length})
      </a>)}</div>
      {groups.map(group => <section key={group.id} id={"batch-" + group.id}>
        <h3>{group.label}</h3>
        {data.runs.filter(group.match).map(run => <div key={run.id} className="schedule-row">
          <div><strong>{run.prompt_text}</strong><small>{engines[run.engine] ?? run.engine}{run.error && ` · ${run.error}`}</small></div>
          <Link to="/app" search={{ org, workspace: run.workspace_id, tab: "runs", batch, receipt, run: run.id }}>
            {group.id === "eligible" ? "View answer" : group.id === "no-answer" && run.has_organic ? "View organic evidence" : "View run"}
          </Link>
        </div>)}
      </section>)}
    </>}
  </CardContent></Card>;
}
