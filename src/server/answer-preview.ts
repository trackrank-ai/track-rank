import { firstBrandMatch, snapshotNames } from "../lib/brand-passage";
import type { Row } from "./types";

// Walk link destinations so parentheses in URL fragments and escaped punctuation
// don't leak into excerpts. An unfinished destination can occur at the read bound.
function visibleLinkText(input: string) {
  let start = 0;
  let result = "";
  const link = /(!?)\[((?:\\.|[^\[\]\\\n])*)\]\(/g;
  for (let match = link.exec(input); match; match = link.exec(input)) {
    result += input.slice(start, match.index) + (match[1] ? " " : match[2]);
    let depth = 1;
    let i = link.lastIndex;
    while (i < input.length && depth > 0) {
      const char = input[i++];
      if (char === "\\") i++;
      else if (char === "(") depth++;
      else if (char === ")") depth--;
    }
    start = link.lastIndex = i;
  }
  return result + input.slice(start);
}

function readableText(input: string) {
  return visibleLinkText(input)
    .replace(/^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/gm, " ")
    .replace(/^( {0,3}\d+)\\([.)])(?=\s)/gm, "$1$2")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/(?:\*\*|__|~~|`+)/g, "")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\W|$)/g, "$1$2")
    .replace(/\\([\\[\]()_*])/g, "$1")
    .replace(/\s+/g, " ").trim();
}

function excerpt(text: string) {
  return text.length > 320 ? text.slice(0, 319).trimEnd() + "…" : text;
}

export function answerPreview(raw: unknown, config: unknown, observations: unknown, preferredBrand?: string | null) {
  if (typeof raw !== "string") return { answer_excerpt: null, brand_passage: null };
  const text = readableText(raw);
  const summary = { answer_excerpt: excerpt(text), brand_passage: null };
  const brands = (config as { brands?: Row[] } | null)?.brands;
  if (!Array.isArray(brands) || !Array.isArray(observations)) return summary;
  const mentioned = new Set(observations.filter(item => item?.mentioned).map(item => item.brand_id));
  for (const brand of brands) {
    if (!brand || !mentioned.has(brand.id) || (preferredBrand && brand.id !== preferredBrand)) continue;
    const names = snapshotNames(brand);
    const match = firstBrandMatch(text, names);
    if (!match || !firstBrandMatch(raw, [match.text])) continue;
    const start = Math.max(0, match.start - 70);
    const end = Math.min(text.length, match.end + 90);
    return { ...summary, brand_passage: {
      brand_id: brand.id, name: brand.name, match: match.text,
      before: (start ? "…" : "") + text.slice(start, match.start),
      after: text.slice(match.end, end) + (end < text.length ? "…" : ""),
    } };
  }
  return summary;
}
