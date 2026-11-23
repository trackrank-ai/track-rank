// Match the same whole names and aliases used by provider normalization. Offsets
// are UTF-16 units, so answer.slice(start, end) recovers the recorded wording.
export function firstBrandMatch(answer: string, names: string[]) {
  let first: { start: number; end: number; text: string } | null = null;
  for (const name of names) {
    if (name.trim().length < 2) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`, "iu").exec(answer);
    if (!match) continue;
    const start = match.index + match[1].length;
    const end = start + match[2].length;
    if (!first || start < first.start || (start === first.start && end > first.end)) {
      first = { start, end, text: match[2] };
    }
  }
  return first;
}

export function snapshotNames(brand: { name?: unknown; aliases?: unknown }) {
  let aliases = brand.aliases;
  if (typeof aliases === "string") {
    try { aliases = JSON.parse(aliases); } catch { aliases = []; }
  }
  return [brand.name, ...(Array.isArray(aliases) ? aliases : [])]
    .filter((name): name is string => typeof name === "string");
}

// Only report a number when the recorded name itself starts a numbered item.
// A name occurring later in the item's explanation carries no list position.
export function recordedListNumber(answer: string, start: number) {
  const lineStart = answer.lastIndexOf("\n", start - 1) + 1;
  const prefix = answer.slice(lineStart, start);
  const number = /^[ \t]{0,3}([1-9]\d{0,2})[.)][ \t]+(?:\*\*|__)?$/.exec(prefix);
  return number ? Number(number[1]) : null;
}
