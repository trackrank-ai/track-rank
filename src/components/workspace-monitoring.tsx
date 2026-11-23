import { Link } from "@tanstack/react-router";
import { useReport } from "./overview";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

type Report = {
  workspace: { id: string; name: string; brand_id: string | null };
  questions: number;
  dataforseo_configured: boolean;
  brands: { id: string; name: string; aliases: string; domain: string; kind: string }[];
  engines: { engine: string; variants: number; schedules: number; enabled_schedules: number; next_check_at: number | null; answers: number; last_answer_at: number | null }[];
};

type Summary = {
  dataforseo_configured: boolean;
  page: number;
  next_page: number | null;
  workspaces: { id: string; name: string; tracked_brands: number; questions: number; enabled_schedules: number; next_check_at: number | null }[];
};

function nextCheck(timestamp: number | null, enabled: number) {
  if (timestamp === null) return enabled ? "Next check pending scheduler" : "No upcoming check";
  return "Next check " + new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
  }) + " UTC";
}

export function WorkspaceMonitoring({ org, workspace, page, request, revision, engines }: {
  org: string; workspace: string; page: number; revision: unknown;
  request: (path: string) => Promise<Record<string, any>>;
  engines: Record<string, string>;
}) {
  const summary = useReport<Summary>(workspace ? "" : "/workspaces/monitoring?page=" + page, request, revision);
  const detail = useReport<Report>(workspace ? "/workspaces/" + encodeURIComponent(workspace) + "/monitoring" : "", request, revision);
  const error = workspace ? detail?.error : summary?.error;
  if (error) return <p role="alert">{error}</p>;
  if (!workspace && summary?.data) {
    const data = summary.data;
    const scope = { org, workspace: "all", tab: "settings", settingsSection: "monitoring" } as const;
    return <Card><CardContent className="form-stack"><h2>Workspace monitoring</h2>
      <p><Link to="/app" search={{ ...scope, settingsSection: "providers" }}>Organization DataForSEO credentials</Link>
        {data.dataforseo_configured ? " connected." : " required for collection."}</p>
      {data.workspaces.map(w => <div className="simple-row" key={w.id}>
        <Link to="/app" search={{ ...scope, workspace: w.id }}><strong>{w.name}</strong>
          <small>{w.questions} saved questions · {w.tracked_brands} tracked brands</small></Link>
        <span>{w.enabled_schedules} enabled schedules<small>{nextCheck(w.next_check_at, w.enabled_schedules)}</small></span>
      </div>)}
      {!data.workspaces.length && <p>No workspaces on this page.</p>}
      {(page > 1 || data.next_page) && <nav className="form-actions" aria-label="Monitoring pages">
        {page > 1 && <Button asChild size="sm" variant="outline"><Link to="/app" search={{ ...scope, monitoringPage: String(page - 1) }}>Previous</Link></Button>}
        {data.next_page && <Button asChild size="sm" variant="outline"><Link to="/app" search={{ ...scope, monitoringPage: String(data.next_page) }}>Next</Link></Button>}
      </nav>}
    </CardContent></Card>;
  }
  const report = detail?.data;
  if (!report) return <p role="status">Loading monitoring setup…</p>;
  const next = report.engines.filter(e => e.next_check_at !== null).sort((a, b) => Number(a.next_check_at) - Number(b.next_check_at))[0];
  const enabled = report.engines.reduce((n, e) => n + e.enabled_schedules, 0);
  const scope = { org, workspace };
  return <div className="form-stack">
    <Card><CardContent className="form-stack"><h2>{report.workspace.name} monitoring</h2>
      <p><strong>{nextCheck(next?.next_check_at ?? null, enabled)}</strong>{next && ` · ${engines[next.engine] ?? next.engine}`}</p>
      <p>{report.questions.toLocaleString()} saved questions · {report.brands.length} tracked brands · {enabled} enabled schedules</p>
      <p>DataForSEO credentials {report.dataforseo_configured ? "connected" : "required for collection"}</p>
      <div className="form-actions"><Link to="/app" search={{ ...scope, tab: "prompts" }}>View questions</Link>
        <Link to="/app" search={{ ...scope, tab: "schedules" }}>View schedules</Link>
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
          <small>{nextCheck(e.next_check_at, e.enabled_schedules)}</small></span>
        <span>{e.answers} answers in searchable history{e.last_answer_at && <small>Last answer {new Date(e.last_answer_at).toLocaleDateString()}</small>}</span>
      </div>) : <p>Save questions and choose their engines to prepare monitoring.</p>}
    </CardContent></Card>
  </div>;
}
