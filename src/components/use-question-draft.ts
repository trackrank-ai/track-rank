import { useEffect, useRef, useState } from "react";

type Draft = {
  text: string;
  separator: string;
  engines: string[];
  tags: string;
  location: string;
  language: string;
  mode: string;
  brand: string;
  destination?: string;
  setName: string;
};

const empty: Draft = {
  text: "", separator: "lines", engines: ["chatgpt"], tags: "", location: "United States",
  language: "en", mode: "standard", brand: "", setName: "",
};

function restore(scope: string): Draft {
  if (!scope) return empty;
  try {
    const raw = sessionStorage.getItem(scope);
    if (!raw) return empty;
    const input = JSON.parse(raw);
    if (typeof input?.text !== "string") return empty;
    const draft = { ...empty, text: input.text };
    for (const key of ["location", "language", "tags", "brand", "destination", "setName"] as const) {
      if (typeof input[key] === "string") draft[key] = input[key];
    }
    if (input.separator === "commas") draft.separator = "commas";
    if (["live", "priority"].includes(input.mode)) draft.mode = input.mode;
    if (Array.isArray(input.engines) && input.engines.every((value: unknown) => ["chatgpt", "gemini", "google"].includes(String(value))))
      draft.engines = [...new Set<string>(input.engines)];
    return draft;
  } catch { return empty; }
}

// Scope drafts to a signed-in user, organization, destination and browser tab.
// Paid collection choices and review receipts have their own explicit lifecycle.
export function useQuestionDraft(scope: string) {
  const [stored, setStored] = useState({ scope: "", draft: empty });
  const current = useRef(stored);
  useEffect(() => {
    const next = { scope, draft: restore(scope) };
    current.current = next;
    setStored(next);
  }, [scope]);
  const draft = stored.scope === scope ? stored.draft : empty;

  function change(patch: Partial<Draft> | null) {
    if (scope !== current.current.scope) return;
    const next = patch ? { ...current.current.draft, ...patch } : empty;
    if (scope) {
      try {
        if (patch) sessionStorage.setItem(scope, JSON.stringify(next));
        else sessionStorage.removeItem(scope);
      } catch { /* Keep the in-memory draft when browser storage is unavailable. */ }
    }
    current.current = { scope, draft: next };
    setStored(current.current);
  }
  return { draft, change };
}
