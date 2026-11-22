import { DAY_MS, utcDay, validDay } from "../lib/analytics-filters";
import { brandOutcome, brandSnapshot, brandSnapshotId, currentPromptWhere, eligibleAnswer, parseHistoryFilters, runConfig, searchableHistoryWhere } from "./run-history";
import { all, now, type Env } from "./types";

function reportingPeriod(params: URLSearchParams) {
  const query = new URLSearchParams(params);
  if (!query.has("to")) query.set("to", utcDay(now()));
  if (!query.has("from") && validDay(query.get("to")!))
    query.set("from", utcDay(Date.parse(query.get("to")!) - 29 * DAY_MS));
  const filters = parseHistoryFilters(query);
  return { query, filters };
}

const citations = "json_each(CASE WHEN json_valid(runs.citations) THEN runs.citations ELSE '[]' END)";
const citationDomain = "CASE WHEN citation.type='object' THEN json_extract(citation.value,'$.domain') END";

export async function analytics(env: Env, org: string, params: URLSearchParams) {
  const { query, filters } = reportingPeriod(params);
  const { conditions, bindings } = await searchableHistoryWhere(env, org, query);
  const selected = currentPromptWhere(filters);
  const setWorkspace = filters.set ? "AND p.workspace_id=(SELECT workspace_id FROM prompt_sets WHERE org_id=p.org_id AND id=?)" : "";
  const rows = await all<{
    kind: "total" | "day" | "brand" | "domain";
    key: string;
    samples: number;
    eligible_answers: number;
    mentions: number;
    citations: number;
    covered_prompts: number;
    selected_prompts: number;
  }>(env, `WITH scoped AS MATERIALIZED (
      SELECT runs.id, runs.prompt_id, runs.workspace_id, runs.created_at, runs.config, runs.mentions, runs.citations,
        (${eligibleAnswer}) AS eligible
      FROM runs WHERE ${conditions.join(" AND ")}
    ), selected AS MATERIALIZED (
      SELECT p.id,p.workspace_id FROM prompts p WHERE p.org_id=? ${filters.workspace ? "AND p.workspace_id=?" : ""}
      ${setWorkspace} AND ${selected.conditions.join(" AND ")}
    ), samples AS MATERIALIZED (
      SELECT DISTINCT runs.id, runs.created_at, ${brandSnapshotId} AS brand_id,
        ${brandOutcome(brandSnapshotId, "mentioned")} AS mentioned,
        ${brandOutcome(brandSnapshotId, "cited")} AS cited
      FROM scoped runs, ${brandSnapshot} AS snapshot WHERE runs.eligible AND ${brandSnapshotId} IS NOT NULL
    )
    SELECT 'total' AS kind,'' AS key,count(*) AS samples,0 AS mentions,0 AS citations,coalesce(sum(eligible),0) AS eligible_answers,
      count(DISTINCT CASE WHEN eligible THEN selected.id END) AS covered_prompts,
      (SELECT count(*) FROM selected) AS selected_prompts
    FROM scoped LEFT JOIN selected ON selected.id=scoped.prompt_id AND selected.workspace_id=scoped.workspace_id
    UNION ALL
    SELECT 'day',date(created_at/1000,'unixepoch'),count(*),sum(mentioned),sum(cited),0,0,0
      FROM samples WHERE brand_id=? GROUP BY date(created_at/1000,'unixepoch')
    UNION ALL
    SELECT 'brand',brand_id,count(*),sum(mentioned),sum(cited),0,0,0 FROM samples GROUP BY brand_id
    UNION ALL
    SELECT 'domain',domain,answers,0,0,0,0,0 FROM (
      SELECT ${citationDomain} AS domain,count(DISTINCT runs.id) AS answers
      FROM scoped runs,${citations} AS citation WHERE runs.eligible AND domain IS NOT NULL AND domain<>''
      GROUP BY domain ORDER BY answers DESC,domain LIMIT 6
    )
    ORDER BY kind,key`, ...bindings, org, ...(filters.workspace ? [filters.workspace] : []),
    ...(filters.set ? [filters.set] : []), ...selected.bindings, filters.tracked_brand ?? null);
  const total = rows.find(row => row.kind === "total")!;
  return {
    from: filters.from, to: filters.to,
    total_runs: total.samples, eligible_answers: total.eligible_answers,
    covered_prompts: total.covered_prompts, selected_prompts: total.selected_prompts,
    brands: rows.filter(row => row.kind === "brand").map(({ key, samples, mentions, citations }) => ({ id: key, samples, mentions, citations })),
    domains: rows.filter(row => row.kind === "domain").map(({ key, samples }) => ({ domain: key, answers: samples }))
      .sort((a, b) => b.answers - a.answers || a.domain.localeCompare(b.domain)),
    daily: rows.filter(row => row.kind === "day").map(({ key, samples, mentions, citations }) => ({ day: key, samples, mentions, citations })),
  };
}

export async function researchSummary(env: Env, org: string, params: URLSearchParams) {
  const { query } = reportingPeriod(params);
  const { conditions, bindings } = await searchableHistoryWhere(env, org, query);
  const rows = await all<{ kind: string; value: string; title: string | null; count: number }>(env, `WITH answers AS MATERIALIZED (
    SELECT id, citations, grounding_queries, discovered_brands FROM runs
    WHERE ${conditions.join(" AND ")} AND ${eligibleAnswer}
  ), sources AS MATERIALIZED (
    SELECT runs.id, ${citationDomain} AS domain,
      json_extract(citation.value,'$.url') AS url, json_extract(citation.value,'$.title') AS title
    FROM answers runs, ${citations} AS citation WHERE citation.type='object'
  ), facets AS (
    SELECT 'domain' AS kind,domain AS value,NULL AS title,count(DISTINCT id) AS count FROM sources GROUP BY domain
    UNION ALL SELECT 'page',url,max(title),count(DISTINCT id) FROM sources GROUP BY url
    UNION ALL SELECT 'query',j.value,NULL,count(DISTINCT answers.id)
      FROM answers,json_each(CASE WHEN json_valid(grounding_queries) THEN grounding_queries ELSE '[]' END) j WHERE j.type='text' GROUP BY j.value
    UNION ALL SELECT 'brand',json_extract(j.value,'$.name'),NULL,count(DISTINCT answers.id)
      FROM answers,json_each(CASE WHEN json_valid(discovered_brands) THEN discovered_brands ELSE '[]' END) j WHERE j.type='object' GROUP BY json_extract(j.value,'$.name')
  ), ranked AS (
    SELECT *, row_number() OVER(PARTITION BY kind ORDER BY count DESC,value) AS rank
    FROM facets WHERE value IS NOT NULL AND value<>''
  )
  SELECT kind,value,title,count FROM ranked WHERE rank<=100
  UNION ALL SELECT 'total','',NULL,count(*) FROM answers
  ORDER BY count DESC,value`, ...bindings);
  return { answers: rows.find(row => row.kind === "total")?.count ?? 0, items: rows.filter(row => row.kind !== "total") };
}

export async function collectionLocations(env: Env, org: string, params: URLSearchParams) {
  const { query } = reportingPeriod(params);
  query.delete("location");
  const { conditions, bindings } = await searchableHistoryWhere(env, org, query);
  const locations = await all<{ name: string }>(env, `SELECT DISTINCT json_extract(${runConfig},'$.location_name') AS name
    FROM runs WHERE ${conditions.join(" AND ")} AND name IS NOT NULL AND name<>'' ORDER BY name LIMIT 500`, ...bindings);
  return { locations: locations.map(row => row.name) };
}
