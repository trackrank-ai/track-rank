import { attributionKeys } from "../lib/citation-page";

// D1 has no URL parser. Split only the query string, retaining non-attribution
// segments verbatim so, for example, product IDs and encoded ampersands survive.
export function citationPageSql(url: string) {
  const keys = attributionKeys.map(key => `'${key}'`).join(",");
  const isAttribution = `name GLOB 'utm_*' OR name IN (${keys})`;
  return `CASE WHEN instr(${url}, '?') = 0 THEN ${url} ELSE (
    WITH RECURSIVE
    address(base, fragment) AS (SELECT
      CASE WHEN instr(${url}, '#') THEN substr(${url}, 1, instr(${url}, '#')-1) ELSE ${url} END,
      CASE WHEN instr(${url}, '#') THEN substr(${url}, instr(${url}, '#')) ELSE '' END),
    parts(part, rest, n) AS (
      SELECT '', substr(base, instr(base, '?')+1) || '&', 0 FROM address WHERE instr(base, '?')
      UNION ALL
      SELECT substr(rest,1,instr(rest,'&')-1), substr(rest,instr(rest,'&')+1), n+1 FROM parts WHERE rest<>''
    ), keyed AS (
      SELECT part, n, lower(substr(part,1,instr(part||'=','=')-1)) AS name FROM parts WHERE n>0
    ), remaining AS (
      SELECT part FROM keyed WHERE NOT (${isAttribution}) ORDER BY n
    )
    SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM keyed WHERE ${isAttribution})
      THEN ${url}
      ELSE substr(base,1,instr(base,'?')-1) || coalesce('?'||nullif((SELECT group_concat(part,'&') FROM remaining),''),'') || fragment END FROM address
  ) END`;
}
