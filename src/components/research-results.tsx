import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AppSearch, ResearchType } from "@/lib/app-location";

const groups = [
  { id: "domain", label: "Domains", empty: "No cited domains match this scope." },
  { id: "page", label: "Pages", empty: "No cited pages match this scope." },
  { id: "query", label: "Grounding queries", empty: "No grounding queries were recorded for these answers." },
] as const;

export type ResearchSummary = {
  answers: number;
  items: { kind: ResearchType | "brand"; value: string; title: string | null; count: number }[];
};

export function ResearchResults({ data, group, search }: { data: ResearchSummary; group: ResearchType; search: AppSearch }) {
  const selected = groups.find(item => item.id === group)!;
  const rows = data.items.filter(item => item.kind === group);
  return <Card><CardContent>
    <h2>Sources & queries</h2>
    <p className="data-note">{data.answers.toLocaleString()} eligible {data.answers === 1 ? "answer" : "answers"} in this scope. Each answer counts once per domain, page or query, even if it repeats.</p>
    <nav className="app-subnav" aria-label="Research groups">
      {groups.map(({ id, label }) => <Button key={id} variant={group === id ? "secondary" : "ghost"} size="sm" asChild>
        <Link to="/app" search={{ ...search, researchGroup: id }} aria-current={group === id ? "page" : undefined}>{label}</Link>
      </Button>)}
    </nav>
    {rows.length === 100 && <p className="data-note">Showing the top 100 matches by answer count.</p>}
    {!rows.length && <p className="data-note">{selected.empty} Broaden the filters or collect more answers.</p>}
    {rows.map(item => <div className="citation-row research-result" key={item.value}>
      <Link to="/app" search={{ ...search, researchGroup: group, researchType: group, researchValue: item.value }}>
        <strong>{item.title || item.value}</strong>
        {group === "page" && item.title && item.title !== item.value && <span>{item.value}</span>}
      </Link>
      <span className="research-result-count">{item.count.toLocaleString()} {item.count === 1 ? "answer" : "answers"}</span>
      {group === "page" && /^https?:\/\//i.test(item.value) && <a className="small-link" href={item.value} target="_blank" rel="noreferrer"
        aria-label={`Open original page for ${item.title || item.value}`}><ExternalLink size={14} /></a>}
    </div>)}
  </CardContent></Card>;
}
