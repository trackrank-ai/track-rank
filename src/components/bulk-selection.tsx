import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Row = Record<string, any>;
type Cursor = { before: number; before_id: string };
type ReadPage = (path: string, signal: AbortSignal) => Promise<Row>;

const PAGE_SIZE = 20;

function pagePath(path: string, params: URLSearchParams, cursor: Cursor | null) {
  if (cursor) {
    params.set("before", String(cursor.before));
    params.set("before_id", cursor.before_id);
  }
  return path + (path.includes("?") ? "&" : "?") + params;
}

export function useBulkPages(path: string | null, field: string, read: ReadPage, refresh: unknown) {
  type Page = { path: string; rows: Row[]; total: number; unchecked?: number; tags: string[]; next: Cursor | null; history: (Cursor | null)[] };
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");
  const [allMatching, setAllMatching] = useState<{ path: string; rows: Row[] } | null>(null);
  const active = useRef<AbortController | null>(null);

  async function load(scope: string, signal: AbortSignal, history: (Cursor | null)[], previous?: Page) {
    setLoading(true);
    setError("");
    try {
      const data = await read(pagePath(scope, new URLSearchParams({ limit: String(PAGE_SIZE) }), history.at(-1) ?? null), signal);
      if (signal.aborted) return;
      setPage({
        path: scope, rows: data[field], total: data.total ?? previous?.total ?? 0,
        unchecked: data.unchecked ?? previous?.unchecked, tags: data.tags ?? [], next: data.next_cursor, history,
      });
    } catch (error) {
      if (!signal.aborted) setError(error instanceof Error ? error.message : "Unable to load this page.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    setPage(null);
    setLoading(false);
    setSelecting(false);
    setError("");
    if (!path) return;
    const controller = new AbortController();
    active.current = controller;
    const timer = window.setTimeout(() => void load(path, controller.signal, [null]), 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      active.current = null;
    };
  }, [path, field, read, refresh]);

  const current = page?.path === path ? page : null;
  function next() {
    if (current?.next && active.current && !loading && !selecting)
      void load(current.path, active.current.signal, [...current.history, current.next], current);
  }
  function previous() {
    if (current && current.history.length > 1 && active.current && !loading && !selecting)
      void load(current.path, active.current.signal, current.history.slice(0, -1), current);
  }

  async function selectAll(onSelect: (rows: Row[]) => void) {
    if (!current || !active.current || loading || selecting) return;
    const { signal } = active.current;
    const rows = new Map<string, Row>();
    let cursor: Cursor | null = null;
    setSelecting(true);
    setError("");
    try {
      do {
        const data = await read(pagePath(current.path, new URLSearchParams({ selection: "1" }), cursor), signal);
        if (signal.aborted) return;
        for (const row of data[field]) rows.set(row.id, row);
        cursor = data.next_cursor;
      } while (cursor);
      onSelect([...rows.values()]);
      setAllMatching({ path: current.path, rows: [...rows.values()] });
      setPage(previous => previous === current ? { ...previous, total: rows.size } : previous);
    } catch (error) {
      if (!signal.aborted) setError(error instanceof Error ? error.message : "Unable to select all matching records.");
    } finally {
      if (!signal.aborted) setSelecting(false);
    }
  }

  const allRows = allMatching?.path === path && allMatching.rows.length === current?.total ? allMatching.rows : null;
  return { current, loading, selecting, error, next, previous, selectAll, allRows };
}

type Pages = ReturnType<typeof useBulkPages>;
type Selection = Map<string, Row>;

export function changeSelection(selection: Selection, rows: Row[], checked: boolean): Selection {
  const next = new Map(selection);
  for (const row of rows) {
    if (checked) next.set(row.id, row);
    else next.delete(row.id);
  }
  return next;
}

export function BulkSelection({
  rows, selected, onChange, pages, disabled, members, selectionLabel = "Selected",
}: {
  rows: Row[];
  selected: Selection;
  onChange: (rows: Row[], checked: boolean) => void;
  pages?: Pages;
  disabled?: boolean;
  members?: (row: Row) => Row[];
  selectionLabel?: string;
}) {
  const pageMembers = members ? rows.flatMap(members) : rows;
  const count = pageMembers.filter(row => selected.has(row.id)).length;
  const wholePage = pageMembers.length > 0 && count === pageMembers.length;
  const allRows = pages?.allRows;
  const allMatching = allRows && (members ? allRows.flatMap(members) : allRows).every(row => selected.has(row.id));
  const checkbox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkbox.current) checkbox.current.indeterminate = count > 0 && !wholePage;
  }, [count, wholePage]);

  return (
    <div className="bulk-selection">
      <label className="check-field">
        <input ref={checkbox} type="checkbox" checked={wholePage}
          disabled={!rows.length || disabled || pages?.loading || pages?.selecting}
          onChange={event => onChange(pageMembers, event.target.checked)} />
        Select all on page
      </label>
      <span role="status">{selectionLabel}: {selected.size.toLocaleString()}</span>
      {wholePage && pages?.current && pages.current.total > PAGE_SIZE && !allMatching && (
        <Button type="button" variant="outline" size="sm"
          disabled={disabled || pages.loading || pages.selecting}
          onClick={() => void pages.selectAll(matches => onChange(members ? matches.flatMap(members) : matches, true))}>
          {pages.selecting ? "Selecting all…" : `Select all: ${pages.current.total.toLocaleString()}`}
        </Button>
      )}
      {selected.size > 0 && <Button type="button" variant="ghost" size="sm"
        disabled={disabled || pages?.selecting}
        onClick={() => onChange([...selected.values()], false)}>Clear selection</Button>}
    </div>
  );
}

export function BulkPageNavigation({ pages, label }: { pages: Pages; label: string }) {
  const { current, previous, next, loading, selecting } = pages;
  if (!current || (current.history.length === 1 && !current.next)) return null;
  return (
    <nav className="bulk-selection" aria-label={label}>
      <Button type="button" size="sm" variant="outline" disabled={loading || selecting || current.history.length === 1} onClick={previous}>Previous</Button>
      <span aria-live="polite">Page {current.history.length}{loading ? " · Loading…" : ""}</span>
      <Button type="button" size="sm" variant="outline" disabled={loading || selecting || !current.next} onClick={next}>Next</Button>
    </nav>
  );
}
