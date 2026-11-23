import { citationPageKey } from "../lib/citation-page";
import { citationPageSql } from "./citation-page";
import { z } from "zod";
import { DAY_MS, utcDay, validDay } from "../lib/analytics-filters";
import { brandOutcome, brandSnapshot, brandSnapshotId, brandTracked, currentPromptWhere, eligibleAnswer, outcomePredicates, parseHistoryFilters, runConfig, runHistoryFilters, searchableHistoryWhere } from "./run-history";
import { trackedWorkspaceBrands } from "./workspace-brands";
import { all, HttpError, now, type Env } from "./types";

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
  const { conditions, bindings, searchableSince } = await searchableHistoryWhere(env, org, query);
  const selected = currentPromptWhere(filters);
  const setWorkspace = filters.set ? "AND p.workspace_id=(SELECT workspace_id FROM prompt_sets WHERE org_id=p.org_id AND id=?)" : "";
  const primary = filters.tracked_brand ?? null;
  const competitor = filters.compare_brand ?? null;
  // Group the competitive rows in their own CTE: local and hosted D1 limit
  // each compound SELECT to five terms.
  const rows = await all<{
    kind: "total" | "day" | "brand" | "domain" | "paired_day" | "engine_brand";
    key: string;
    samples: number;
    eligible_answers: number;
    mentions: number;
    citations: number;
    covered_prompts: number;
    selected_prompts: number;
    compare_mentions: number;
    compare_citations: number;
  }>(env, `WITH scoped AS MATERIALIZED (
      SELECT runs.id, runs.prompt_id, runs.workspace_id, runs.created_at, runs.config, runs.mentions, runs.citations,
        (${eligibleAnswer}) AS eligible
      FROM runs WHERE ${conditions.join(" AND ")}
    ), selected AS MATERIALIZED (
      SELECT p.id,p.question_id,p.workspace_id FROM prompts p WHERE p.org_id=? ${filters.workspace ? "AND p.workspace_id=?" : ""}
      ${setWorkspace} AND ${selected.conditions.join(" AND ")}
    ), samples AS MATERIALIZED (
      SELECT runs.id, runs.created_at, json_extract(${runConfig},'$.engine') AS engine, ${brandSnapshotId} AS brand_id,
        max(json_extract(snapshot.value,'$.name')) AS name,
        ${brandOutcome(brandSnapshotId, "mentioned")} AS mentioned,
        ${brandOutcome(brandSnapshotId, "cited")} AS cited
      FROM scoped runs, ${brandSnapshot} AS snapshot WHERE runs.eligible AND ${brandSnapshotId} IS NOT NULL
      GROUP BY runs.id,brand_id
    ), competitive AS (
      SELECT 'paired_day' AS kind,date(primary_sample.created_at/1000,'unixepoch') AS key,count(*) AS samples,
        sum(primary_sample.mentioned) AS mentions,sum(primary_sample.cited) AS citations,
        0 AS eligible_answers,0 AS covered_prompts,0 AS selected_prompts,
        sum(other_sample.mentioned) AS compare_mentions,sum(other_sample.cited) AS compare_citations
      FROM samples primary_sample JOIN samples other_sample ON other_sample.id=primary_sample.id
      WHERE primary_sample.brand_id=? AND other_sample.brand_id=?
      GROUP BY date(primary_sample.created_at/1000,'unixepoch')
      UNION ALL
      SELECT 'engine_brand',json_array(s.engine,s.brand_id,max(s.name)),count(*),sum(s.mentioned),sum(s.cited),0,0,0,0,0
      FROM samples s
      ${competitor ? `JOIN samples paired ON paired.id=s.id AND
        ((s.brand_id=? AND paired.brand_id=?) OR (s.brand_id=? AND paired.brand_id=?))` : ""}
      GROUP BY s.engine,s.brand_id
    )
    SELECT * FROM competitive
    UNION ALL
    SELECT 'total' AS kind,'' AS key,count(*) AS samples,0 AS mentions,0 AS citations,coalesce(sum(eligible),0) AS eligible_answers,
      count(DISTINCT CASE WHEN eligible THEN selected.question_id END) AS covered_prompts,
      (SELECT count(DISTINCT question_id) FROM selected) AS selected_prompts,0,0
    FROM scoped LEFT JOIN selected ON selected.id=scoped.prompt_id AND selected.workspace_id=scoped.workspace_id
    UNION ALL
    SELECT 'day',date(created_at/1000,'unixepoch'),count(*),sum(mentioned),sum(cited),0,0,0,0,0
      FROM samples WHERE brand_id=? GROUP BY date(created_at/1000,'unixepoch')
    UNION ALL
    SELECT 'brand',json_array(brand_id,max(name)),count(*),sum(mentioned),sum(cited),0,0,0,0,0 FROM samples GROUP BY brand_id
    UNION ALL
    SELECT 'domain',domain,answers,0,0,0,0,0,0,0 FROM (
      SELECT ${citationDomain} AS domain,count(DISTINCT runs.id) AS answers
      FROM scoped runs,${citations} AS citation WHERE runs.eligible AND domain IS NOT NULL AND domain<>''
      GROUP BY domain ORDER BY answers DESC,domain LIMIT 6
    )
    ORDER BY kind,key`, ...bindings, org, ...(filters.workspace ? [filters.workspace] : []),
    ...(filters.set ? [filters.set] : []), ...selected.bindings,
    primary, competitor, ...(competitor ? [primary, competitor, competitor, primary] : []), primary);
  const total = rows.find(row => row.kind === "total")!;
  const unrestricted = await searchableHistoryWhere(env, org, new URLSearchParams(filters.workspace ? { workspace: filters.workspace } : {}));
  const [previous_period, outcomes, workspaceTotals] = await Promise.all([
    previousBrandPeriod(env, org, query, filters.from!, filters.to!, searchableSince),
    all<{ outcome: string; count: number }>(env, `SELECT CASE
      WHEN ${outcomePredicates.pending} THEN 'pending' WHEN ${outcomePredicates.failed} THEN 'failed'
      WHEN ${outcomePredicates.uncertain} THEN 'uncertain' WHEN ${eligibleAnswer} THEN 'eligible'
      WHEN ${outcomePredicates.organic} THEN 'organic' ELSE 'no_answer' END AS outcome, count(*) AS count
      FROM runs WHERE ${conditions.join(" AND ")} GROUP BY outcome`, ...bindings),
    all<{ prompts: number; first_run: number | null }>(env, `SELECT
      (SELECT count(DISTINCT question_id) FROM prompts WHERE org_id=? AND archived_at IS NULL ${filters.workspace ? "AND workspace_id=?" : ""}) AS prompts,
      (SELECT min(created_at) FROM runs WHERE ${unrestricted.conditions.join(" AND ")}) AS first_run`,
      org, ...(filters.workspace ? [filters.workspace] : []), ...unrestricted.bindings),
  ]);
  const pairedDays = rows.filter(row => row.kind === "paired_day");
  const credited = pairedDays.reduce((total, day) => ({
    samples: total.samples + day.samples,
    primary: total.primary + day.mentions,
    competitor: total.competitor + day.compare_mentions,
  }), { samples: 0, primary: 0, competitor: 0 });
  const mentions = credited.primary + credited.competitor;
  const brands = rows.filter(row => row.kind === "brand").map(({ key, samples, mentions, citations }) => {
    const [id, name] = JSON.parse(key) as [string, string | null];
    return { id, name, samples, mentions, citations };
  });
  const individual_coverage = primary && competitor && !credited.samples
    ? await Promise.all([primary, competitor].map(async id => {
      if (!filters.match_from && !filters.overlap && !filters.metric)
        return { id, samples: brands.find(brand => brand.id === id)?.samples ?? 0 };
      const individual = new URLSearchParams(query);
      individual.delete("compare_brand");
      individual.delete("overlap");
      individual.set("tracked_brand", id);
      individual.set("metric", "brand");
      const single = await searchableHistoryWhere(env, org, individual);
      const [count] = await all<{ samples: number }>(env,
        `SELECT count(*) AS samples FROM runs WHERE ${single.conditions.join(" AND ")}`, ...single.bindings);
      return { id, samples: count.samples };
    })) : [];
  return {
    from: filters.from, to: filters.to,
    mention_share: primary && competitor ? {
      samples: credited.samples, credited_mentions: mentions,
      brands: [{ id: primary, mentions: credited.primary }, { id: competitor, mentions: credited.competitor }]
        .map(brand => ({ ...brand, share: mentions ? brand.mentions / mentions : null })),
    } : null,
    workspace_prompts: workspaceTotals[0].prompts, workspace_has_runs: workspaceTotals[0].first_run !== null, workspace_first_run: workspaceTotals[0].first_run,
    outcomes: Object.fromEntries(outcomes.map(row => [row.outcome, row.count])),
    previous_period, individual_coverage,
    engine_brands: rows.filter(row => row.kind === "engine_brand").map(({ key, samples, mentions, citations }) => {
      const [engine, id, name] = JSON.parse(key) as [string | null, string, string | null];
      return { engine, id, name, samples, mentions, citations };
    }),
    total_runs: total.samples, eligible_answers: total.eligible_answers,
    covered_prompts: total.covered_prompts, selected_prompts: total.selected_prompts,
    brands,
    domains: rows.filter(row => row.kind === "domain").map(({ key, samples }) => ({ domain: key, answers: samples }))
      .sort((a, b) => b.answers - a.answers || a.domain.localeCompare(b.domain)),
    comparison_daily: pairedDays
      .map(({ key, samples, mentions, citations, compare_mentions, compare_citations }) =>
        ({ day: key, samples, mentions, citations, compare_mentions, compare_citations })),
    daily: rows.filter(row => row.kind === "day").map(({ key, samples, mentions, citations }) => ({ day: key, samples, mentions, citations })),
  };
}

async function previousBrandPeriod(env: Env, org: string, query: URLSearchParams, from: string, to: string, searchableSince: number | null) {
  const end = Date.parse(from);
  const start = end - (Date.parse(to) - end + DAY_MS);
  const previous = {
    from: utcDay(start), to: utcDay(end - DAY_MS),
    complete: (searchableSince === null || start >= searchableSince) && end <= now(),
    samples: 0, mentions: 0, citations: 0, compare_mentions: 0, compare_citations: 0,
    question_mix_changed: false, engine_mix_changed: false,
  };
  const brand = query.get("tracked_brand");
  if (!validDay(previous.from) || !validDay(previous.to)) return { ...previous, complete: false };
  if (!brand || (searchableSince !== null && end <= searchableSince)) return previous;
  const prior = new URLSearchParams(query);
  prior.set("metric", "brand");
  prior.set("from", previous.from);
  prior.set("to", previous.to);
  if (query.has("match_from")) {
    prior.set("match_from", from);
    prior.set("match_to", to);
  }
  const current = new URLSearchParams(query);
  current.set("metric", "brand");
  const competitor = query.get("compare_brand");
  const [priorWhere, currentWhere] = await Promise.all([
    searchableHistoryWhere(env, org, prior), searchableHistoryWhere(env, org, current),
  ]);
  const cell = `workspace_id,prompt_text,json_extract(${runConfig},'$.engine') AS engine`;
  // Compare fractional sample weights as integers. A change in question or engine
  // mix can explain a rate change even if both periods contained the same labels.
  const changed = (groups: string) => `EXISTS (SELECT 1 FROM cells GROUP BY ${groups}
    HAVING sum(current_samples)*totals.samples <> sum(prior_samples)*totals.current_samples)`;
  const [counts] = await all<{
    samples: number; mentions: number; citations: number; compare_mentions: number; compare_citations: number;
    question_mix_changed: number; engine_mix_changed: number;
  }>(env, `WITH cells AS MATERIALIZED (
      SELECT ${cell},count(*) AS prior_samples,0 AS current_samples,
        sum(${brandOutcome("?", "mentioned")}) AS mentions, sum(${brandOutcome("?", "cited")}) AS citations,
        sum(${brandOutcome("?", "mentioned")}) AS compare_mentions, sum(${brandOutcome("?", "cited")}) AS compare_citations
      FROM runs WHERE ${priorWhere.conditions.join(" AND ")} GROUP BY workspace_id,prompt_text,engine
      UNION ALL
      SELECT ${cell},0,count(*),0,0,0,0 FROM runs WHERE ${currentWhere.conditions.join(" AND ")}
      GROUP BY workspace_id,prompt_text,engine
    ), totals AS (
      SELECT total(prior_samples) AS samples,total(current_samples) AS current_samples,
        total(mentions) AS mentions,total(citations) AS citations,
        total(compare_mentions) AS compare_mentions,total(compare_citations) AS compare_citations FROM cells
    )
    SELECT samples,mentions,citations,compare_mentions,compare_citations,
      ${changed("workspace_id,prompt_text")} AS question_mix_changed,${changed("engine")} AS engine_mix_changed
      FROM totals`, brand, brand, competitor, competitor, ...priorWhere.bindings, ...currentWhere.bindings);
  return { ...previous, ...counts, question_mix_changed: !!counts.question_mix_changed, engine_mix_changed: !!counts.engine_mix_changed };
}

export const overviewQuestionsPage = z.number().int().min(1).max(1_000_000);
export const overviewQuestionSort = z.enum(["answers", "mentions", "citations"]);
const questionPageSize = 20;

export async function overviewQuestions(env: Env, org: string, params: URLSearchParams) {
  const parsedPage = overviewQuestionsPage.safeParse(Number(params.get("page") ?? 1));
  if (!parsedPage.success) throw new HttpError(400, "Invalid question breakdown page");
  const sort = overviewQuestionSort.safeParse(params.get("sort") ?? "answers");
  if (!sort.success) throw new HttpError(400, "Invalid question breakdown sort");
  const rank = sort.data === "answers" ? "" : sort.data + " DESC, ";
  const page = parsedPage.data;
  const { query, filters } = reportingPeriod(params);
  const { conditions, bindings } = await searchableHistoryWhere(env, org, query);
  const brands = [filters.tracked_brand, filters.compare_brand].filter(brand => brand !== undefined);
  const cohort = brands.map(() => brandTracked);
  const rows = await all<{
    evidence_run_id: string;
    workspace_id: string;
    question: string;
    engine: string | null;
    eligible_answers: number;
    mentions: number;
    citations: number;
    compare_mentions: number;
    compare_citations: number;
  }>(env, `SELECT min(runs.id) AS evidence_run_id, runs.workspace_id, runs.prompt_text AS question,
      json_extract(${runConfig},'$.engine') AS engine, count(*) AS eligible_answers,
      sum(${brandOutcome("?", "mentioned")}) AS mentions, sum(${brandOutcome("?", "cited")}) AS citations,
      sum(${brandOutcome("?", "mentioned")}) AS compare_mentions, sum(${brandOutcome("?", "cited")}) AS compare_citations
    FROM runs WHERE ${[...conditions, eligibleAnswer, ...cohort].join(" AND ")}
    GROUP BY runs.workspace_id, runs.prompt_text, engine
    ORDER BY ${rank}eligible_answers DESC, question COLLATE NOCASE, evidence_run_id
    LIMIT ? OFFSET ?`,
    filters.tracked_brand ?? null, filters.tracked_brand ?? null, filters.compare_brand ?? null, filters.compare_brand ?? null,
    ...bindings, ...brands, questionPageSize + 1, (page - 1) * questionPageSize);
  return { questions: rows.slice(0, questionPageSize), next_page: rows.length > questionPageSize ? page + 1 : null };
}

export const researchReportInput = {
  group: z.enum(["domain", "page", "query", "brand"]).optional(),
  source_search: z.string().trim().max(200).optional(),
  sort: z.enum(["answers", "questions", "last_seen", "value"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  page: z.number().int().min(1).max(1_000_000).optional(),
  view: z.enum(["pages", "questions"]).optional(),
  research_type: runHistoryFilters.shape.research_type,
  research_value: runHistoryFilters.shape.research_value,
};

export async function researchSummary(env: Env, org: string, params: URLSearchParams) {
  const parsed = z.object(researchReportInput).safeParse({
    ...Object.fromEntries(params),
    page: params.has("page") ? Number(params.get("page")) : undefined,
  });
  if (!parsed.success) throw new HttpError(400, "Invalid sources report filters");
  const { group = "domain", source_search, sort = "answers", direction = "desc", page = 1,
    view, research_type, research_value } = parsed.data;
  if (!!research_type !== !!research_value || (view && !research_type))
    throw new HttpError(400, "Choose a source to inspect");

  const { query } = reportingPeriod(params);
  query.delete("research_type");
  query.delete("research_value");
  const { conditions, bindings } = await searchableHistoryWhere(env, org, query);
  const cohort = `WITH answers AS MATERIALIZED (
    SELECT id, workspace_id, prompt_text, created_at, citations, grounding_queries, discovered_brands
    FROM runs WHERE ${conditions.join(" AND ")} AND ${eligibleAnswer}
  )`;
  const citationValues = (kind: "domain" | "page") => kind === "domain" ? citationDomain : citationPageSql("json_extract(citation.value,'$.url')");
  const sourceValues = (kind: "domain" | "page" | "query" | "brand", from: string, restrictDomain = false) => kind === "brand"
    ? `SELECT runs.*, json_extract(j.value,'$.name') AS value, NULL AS title FROM ${from} runs,
        json_each(CASE WHEN json_valid(discovered_brands) THEN discovered_brands ELSE '[]' END) j WHERE j.type='object'`
    : kind === "query" ? `SELECT runs.*, j.value AS value, NULL AS title FROM ${from} runs,
        json_each(CASE WHEN json_valid(grounding_queries) THEN grounding_queries ELSE '[]' END) j WHERE j.type='text'`
    : `SELECT runs.*, ${citationValues(kind)} AS value,
        ${kind === "page" ? "json_extract(citation.value,'$.title')" : "NULL"} AS title
        FROM ${from} runs, ${citations} AS citation WHERE citation.type='object'
        ${restrictDomain ? `AND ${citationDomain}=?` : ""}`;
  const cte = research_type
    ? cohort + `, matching AS MATERIALIZED (
      SELECT answers.* FROM answers JOIN (
        SELECT DISTINCT id FROM (${sourceValues(research_type, "answers")}) WHERE value=?
      ) matched USING(id)
    )`
    : cohort;
  const target = research_type ? "matching" : "answers";
  const detailView = view ?? (research_type === "domain" ? "pages" : "questions");
  const kind = research_type ? detailView === "questions" ? "question" : "page" : group;
  const facet = kind === "question"
    ? `SELECT prompt_text AS value, NULL AS title, workspace_id,
        min(id) AS evidence_run_id, count(*) AS count, 1 AS questions, max(created_at) AS last_seen
      FROM matching GROUP BY workspace_id, prompt_text`
    : `SELECT value, max(title) AS title, NULL AS workspace_id, NULL AS evidence_run_id,
        count(DISTINCT id) AS count, count(DISTINCT json_array(workspace_id, prompt_text)) AS questions,
        max(created_at) AS last_seen
      FROM (${sourceValues(kind, target, research_type === "domain")})
      WHERE typeof(value)='text' AND value<>'' GROUP BY value`;
  const order = { answers: "count", questions: "questions", last_seen: "last_seen", value: "value COLLATE NOCASE" }[sort];
  const pageSize = 25;
  const scopedBindings = research_type ? [...bindings, research_type === "page" ? citationPageKey(research_value!) : research_value] : bindings;
  const domainReport = kind === "domain";
  const rows = await all<{
    value: string; title: string | null; count: number; questions: number; last_seen: number | null;
    workspace_id: string | null; evidence_run_id: string | null;
    row_type: "item" | "facets" | "cohort" | "matching" | "day" | "domain_day";
  }>(env, `${cte}, facets AS MATERIALIZED (
    SELECT * FROM (${facet})
    WHERE instr(lower(value),lower(?))>0 OR instr(lower(coalesce(title,'')),lower(?))>0
  ), page_rows AS (
    SELECT * FROM facets ORDER BY ${order} ${direction}, value, evidence_run_id LIMIT ? OFFSET ?
  )
  SELECT *, 'item' AS row_type FROM page_rows
  ${domainReport ? `
    UNION ALL SELECT value,date(created_at/1000,'unixepoch'),NULL,NULL,count(DISTINCT id),0,NULL,'domain_day'
    FROM (${sourceValues("domain", "answers")})
    WHERE value IN (SELECT value FROM page_rows ORDER BY count DESC,value LIMIT 3)
    GROUP BY value,date(created_at/1000,'unixepoch')
  ` : ""}
  UNION ALL SELECT '',NULL,NULL,NULL,count(*),0,NULL,'facets' FROM facets
  UNION ALL SELECT '',NULL,NULL,NULL,count(*),0,NULL,'cohort' FROM answers
  ${research_type ? `
    UNION ALL SELECT '',NULL,NULL,NULL,count(*),count(DISTINCT json_array(workspace_id,prompt_text)),max(created_at),'matching' FROM matching
    UNION ALL SELECT date(created_at/1000,'unixepoch'),NULL,NULL,NULL,count(*),0,NULL,'day' FROM matching GROUP BY 1
  ` : ""}`,
  ...scopedBindings, ...(research_type === "domain" && kind === "page" ? [research_value] : []),
  source_search ?? "", source_search ?? "", pageSize, (page - 1) * pageSize);
  const answers = rows.find(row => row.row_type === "cohort")!.count;
  const match = rows.find(row => row.row_type === "matching");
  const total = rows.find(row => row.row_type === "facets")!.count;
  const workspace = query.get("workspace");
  const mappings = domainReport && workspace ? await trackedWorkspaceBrands(env, org, workspace) : [];
  const ownership = (domain: string) => mappings.filter(brand => {
    const canonical = String(brand.domain || "").toLowerCase().replace(/^www\./, "");
    return canonical && (domain === canonical || domain.endsWith("." + canonical));
  }).map(({ id, name, kind }) => ({ id, name, kind }));
  const primary = query.get("tracked_brand");
  const comparison = query.get("compare_brand");
  let comparisonCoverage;
  if (primary && comparison && !research_type && group !== "brand") {
    const coverageQuery = new URLSearchParams(query);
    coverageQuery.delete("overlap");
    coverageQuery.delete("metric");
    const base = await searchableHistoryWhere(env, org, coverageQuery);
    const [counts] = await all<{ primary_answers: number; comparison_answers: number; shared_answers: number }>(
      env, `WITH measured AS MATERIALIZED (SELECT ${brandTracked} AS a, ${brandTracked} AS b FROM runs
        WHERE ${base.conditions.join(" AND ")} AND ${eligibleAnswer})
        SELECT count(*) FILTER (WHERE a) AS primary_answers, count(*) FILTER (WHERE b) AS comparison_answers,
          count(*) FILTER (WHERE a AND b) AS shared_answers FROM measured`, primary, comparison, ...base.bindings);
    comparisonCoverage = { primary, comparison, ...counts };
  }
  return {
    comparison_coverage: comparisonCoverage,
    domain_trends: rows.filter(row => row.row_type === "domain_day")
      .map(row => ({ domain: row.value, day: row.title!, answers: row.count })),
    answers, total, page, next_page: page * pageSize < total ? page + 1 : null,
    items: rows.filter(row => row.row_type === "item").map(({ row_type, ...row }) => ({
      ...row, kind, ...(domainReport ? { ownership: ownership(row.value) } : {}), share: answers ? row.count / answers : 0,
    })),
    detail: match ? {
      count: match.count, questions: match.questions, last_seen: match.last_seen,
      share: answers ? match.count / answers : 0,
      daily: rows.filter(row => row.row_type === "day")
        .map(({ value, count }) => ({ day: value, answers: count }))
        .sort((a, b) => a.day.localeCompare(b.day)),
    } : null,
  };
}

export async function collectionLocations(env: Env, org: string, params: URLSearchParams) {
  const { query } = reportingPeriod(params);
  query.delete("location");
  const { conditions, bindings } = await searchableHistoryWhere(env, org, query);
  const locations = await all<{ name: string }>(env, `SELECT DISTINCT json_extract(${runConfig},'$.location_name') AS name
    FROM runs WHERE ${conditions.join(" AND ")} AND name IS NOT NULL AND name<>'' ORDER BY name LIMIT 500`, ...bindings);
  return { locations: locations.map(row => row.name) };
}
