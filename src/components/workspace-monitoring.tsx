import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "./ui/card";

type Report = {
  workspace: { id: string; name: string; brand_id: string | null };
  questions: number;
  dataforseo_configured: boolean;
  brands: { id: string; name: string; aliases: string; domain: string; kind: string }[];
  engines: { engine: string; variants: number; schedules: number; enabled_schedules: number; next_check_at: number | null; answers: number; last_answer_at: number | null }[];
};

export function WorkspaceMonitoring({ org, workspace, request, revision, workspaces, engines }: {
  org: string; workspace: string; revision: unknown;
  request: (path: string) => Promise<Record<string, any>>;
  workspaces: { id: string; name: string }[];
  engines: Record<string, string>;
}) {
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!workspace) return;
    let current = true;
    setError("");
    request("/workspaces/" + encodeURIComponent(workspace) + "/monitoring")
      .then(result => { if (current) setReport(result as Report); })
      .catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [request, workspace, org, revision]);
  if (!workspace) return <Card><CardContent><h2>Workspace monitoring</h2>
    <p>Choose a workspace to see which brands, engines and schedules it tracks.</p>
    <ul>{workspaces.map(w => <li key={w.id}><Link to="/app" search={{ org, workspace: w.id, tab: "settings", settingsSection: "monitoring" }}>{w.name}</Link></li>)}</ul>
  </CardContent></Card>;
  if (error) return <p role="alert">{error}</p>;
  if (report?.workspace.id !== workspace) return <p role="status">Loading monitoring setup…</p>;
  const scope = { org, workspace };
  return <div className="form-stack">
    <Card><CardContent className="form-stack"><h2>{report.workspace.name} monitoring</h2>
      <p>{report.questions.toLocaleString()} saved questions · DataForSEO credentials {report.dataforseo_configured ? "connected" : "required for collection"}</p>
      <div className="form-actions"><Link to="/app" search={{ ...scope, tab: "prompts" }}>View questions</Link>
        <Link to="/app" search={{ ...scope, tab: "settings", settingsSection: "providers" }}>Organization providers</Link></div>
    </CardContent></Card>
    <Card><CardContent><div className="panel-title"><h2>Brands in future checks</h2>
      <Link to="/app" search={{ ...scope, tab: "brands" }}>Manage brands</Link></div>
      {report.brands.length ? report.brands.map(b => <div className="simple-row" key={b.id}>
        <span><strong>{b.name}</strong><small>{[b.domain, ...JSON.parse(b.aliases || "[]")].filter(Boolean).join(" · ") || "No domain or aliases"}</small></span>
        <span>{b.id === report.workspace.brand_id ? "Primary · " : ""}{b.kind}</span>
      </div>) : <p>Assign a brand to measure mentions and citations in future answers.</p>}
    </CardContent></Card>
    <Card><CardContent><div className="panel-title"><h2>Engines and schedules</h2>
      <Link to="/app" search={{ ...scope, tab: "schedules" }}>Manage schedules</Link></div>
      {report.engines.length ? report.engines.map(e => <div className="simple-row" key={e.engine}>
        <span><strong>{engines[e.engine] ?? e.engine}</strong>
          <small>{e.variants} saved variants · {e.enabled_schedules} enabled / {e.schedules} schedules</small>
          <small>{e.next_check_at ? "Next scheduled check " + new Date(e.next_check_at).toLocaleString() : e.enabled_schedules ? "Next check pending scheduler" : "No upcoming check"}</small></span>
        <span>{e.answers} answers in searchable history{e.last_answer_at && <small>Last answer {new Date(e.last_answer_at).toLocaleDateString()}</small>}</span>
      </div>) : <p>Save questions and choose their engines to prepare monitoring.</p>}
    </CardContent></Card>
  </div>;
}
