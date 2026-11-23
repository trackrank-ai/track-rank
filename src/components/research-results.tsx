import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { researchSorts, type AppSearch, type ResearchType } from "@/lib/app-location";

const groups = [
  { id: "domain", label: "Domains" },
  { id: "page", label: "Pages" },
  { id: "query", label: "Grounding queries" },
] as const;

type SourceSort = typeof researchSorts[number];
export type SourceItem = {
  kind: ResearchType | "question" | "brand";
  value: string;
  title: string | null;
  count: number;
  questions: number;
  share: number;
  last_seen: number;
  workspace_id: string | null;
  evidence_run_id: string | null;
};
export type ResearchSummary = {
  answers: number;
  items: SourceItem[];
  total: number;
  page: number;
  next_page: number | null;
  detail: {
    count: number;
    questions: number;
    share: number;
    last_seen: number | null;
    daily: { day: string; answers: number }[];
  } | null;
};

const share = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });
export const formatShare = (value: number) => share.format(value);
export const formatLastSeen = (time: number) => new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium", timeZone: "UTC",
}).format(time);

export function SourcePagination({ data, search, field }: {
  data: ResearchSummary; search: AppSearch; field: "sourcePage" | "sourceDetailPage" | "sourceBrandPage";
}) {
  if (data.page === 1 && !data.next_page) return null;
  return <nav className="app-inline-form mt-4" aria-label="Source pages">
    {data.page > 1 && <Button variant="outline" size="sm" asChild>
      <Link to="/app" search={{ ...search, [field]: String(data.page - 1) }}>Previous</Link>
    </Button>}
    <span className="data-note">Page {data.page.toLocaleString()}</span>
    {data.next_page && <Button variant="outline" size="sm" asChild>
      <Link to="/app" search={{ ...search, [field]: String(data.next_page) }}>Next</Link>
    </Button>}
  </nav>;
}

export function SourceTable({ rows, link, title, questionRows, questionContext, search }: {
  rows: SourceItem[];
  link: (item: SourceItem) => AppSearch;
  title: string;
  questionRows?: boolean;
  questionContext?: (item: SourceItem) => string;
  search?: AppSearch;
}) {
  function header(label: string, field: SourceSort) {
    const active = !!search && (search.sourceSort ?? "answers") === field;
    const direction = search?.sourceDirection ?? "desc";
    const nextDirection = active ? direction === "asc" ? "desc" : "asc" : field === "value" ? "asc" : "desc";
    const Icon = active ? direction === "asc" ? ArrowUp : ArrowDown : ChevronsUpDown;
    return <th scope="col" aria-sort={active ? direction === "asc" ? "ascending" : "descending" : undefined}>
      {search ? <Link to="/app" className="inline-flex items-center gap-1.5 hover:underline"
        search={{ ...search, sourceSort: field, sourceDirection: nextDirection, sourcePage: undefined }}>
        {label}<Icon size={13} className={active ? undefined : "text-muted-foreground"} aria-hidden="true" />
      </Link> : label}
    </th>;
  }
  return <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={title + " metrics"}>
    <table className="source-table">
      <thead><tr>
        {header(title, "value")}{header("Answers", "answers")}{!questionRows && header("Questions", "questions")}
        <th scope="col">Share of answers</th>{header("Last seen (UTC)", "last_seen")}
      </tr></thead>
      <tbody>{rows.map(item => <tr key={item.evidence_run_id ?? item.value}>
        <th scope="row">
          <Link to="/app" search={link(item)}>{item.title || item.value}</Link>
          {item.title && item.title !== item.value && <small>{item.value}</small>}
          {questionContext && <small>{questionContext(item)}</small>}
          {item.kind === "page" && /^https?:\/\//i.test(item.value) && <a className="small-link" href={item.value} target="_blank" rel="noreferrer"
            aria-label={`Open original for ${item.title || item.value}`}><ExternalLink size={13} aria-hidden="true" /> Open original</a>}
        </th>
        <td>{item.count.toLocaleString()}</td>
        {!questionRows && <td>{item.questions.toLocaleString()}</td>}
        <td>{formatShare(item.share)}</td>
        <td>{formatLastSeen(item.last_seen)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

export function ResearchResults({ data, group, search, error, onSearch }: {
  data?: ResearchSummary;
  group: ResearchType;
  search: AppSearch;
  error?: string;
  onSearch: (value: string) => void;
}) {
  const [draft, setDraft] = useState(search.sourceSearch ?? "");
  const title = groups.find(item => item.id === group)!.label;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(draft.trim());
  }
  return <Card><CardContent>
    <nav className="app-subnav" aria-label="Source groups">
      {groups.map(({ id, label }) => <Button key={id} variant={group === id ? "secondary" : "ghost"} size="sm" asChild>
        <Link to="/app" search={{ ...search, researchGroup: id, sourcePage: undefined }} aria-current={group === id ? "page" : undefined}>{label}</Link>
      </Button>)}
    </nav>
    <form onSubmit={submit} className="app-inline-form source-search-form mt-4">
      <input type="search" aria-label={`Search ${title.toLowerCase()}`} placeholder={`Search ${title.toLowerCase()}`} value={draft} maxLength={200} onChange={event => setDraft(event.target.value)} />
      <Button size="sm" variant="outline" type="submit">Search</Button>
      {search.sourceSearch && <Button size="sm" variant="ghost" onClick={() => { setDraft(""); onSearch(""); }} type="button">Clear</Button>}
    </form>
    {error ? <p role="alert" className="mt-4">{error}</p> : !data ? <p role="status" className="data-note mt-4">Loading sources…</p> : <>
      <p className="data-note my-4" role="status">{data.total.toLocaleString()} {data.total === 1 ? "match" : "matches"} across {data.answers.toLocaleString()} eligible {data.answers === 1 ? "answer" : "answers"}. Each answer counts once per source.</p>
      {data.items.length ? <SourceTable rows={data.items} title={title} search={search}
        link={item => ({ ...search, researchType: group, researchValue: item.value })} />
        : <p className="data-note">{search.sourceSearch ? "No matches. Try another search." : "No results in this scope. Try a different engine or date range."}</p>}
      <SourcePagination data={data} search={search} field="sourcePage" />
    </>}
  </CardContent></Card>;
}
