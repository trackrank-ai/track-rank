import { profilePricing, llmRates, llmPricingUrl, googlePricingUrl, providerBillingUrl } from "@/lib/provider-pricing";
import { competitors, type Competitor } from "@/data/competitors";
import { PublicLayout, HostingActions, SELF_HOST_URL } from "./public-layout";
import { CostCalculator } from "./pricing-section";
import { estimatePricing, REPOSITORY_URL, type PricedPlan } from "@/lib/pricing-estimate";
import { formatBillingPrice } from "@/lib/billing-price";
import "./comparison-pages.css";

type Catalog = { hosted: boolean; offers: (PricedPlan & { offer_key: string })[] };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

function TrackRankDifference() {
  return <section><h2>Open source. Your credentials. Your choice of hosting.</h2>
    <p>TrackRank is <a href={`${REPOSITORY_URL}/blob/main/LICENSE`}>MIT-licensed</a>. Inspect it, fork it and adapt the code to your reporting workflow. <a href={SELF_HOST_URL}>Self-host on your own Cloudflare account</a> with no TrackRank software subscription, or use managed hosting.</p>
    <p>Bring your own DataForSEO credentials for ChatGPT, Gemini and Google AI Overviews collection. Optional OpenRouter analysis is separate. You pay the provider directly, so hosting and collection spending stay visible instead of being bundled into a fixed prompt package.</p>
    <p>Free self-hosting means a free software license—not free infrastructure or free searches. Cloudflare, email and provider usage may cost money. The supported deployment is Cloudflare Workers, D1, R2 and Workflows; standalone Docker/VPS deployment is not implemented.</p>
    <p>Use workspaces, bulk questions, independent repeated samples, paused-by-default schedules, CSV exports, the REST API and MCP. Source access gives you code-level flexibility; it does not promise unlimited throughput, every engine or every enterprise feature. <a href={`${REPOSITORY_URL}/blob/main/docs/API.md`}>Read the API and MCP guide</a>.</p>
  </section>;
}

function Facts({ item }: { item: Competitor }) {
  const ourSide = ["Hosting and provider usage priced separately; no TrackRank subscription for self-hosting.", "One run = one prompt × one engine × one sample; collection requires your DataForSEO account.", "No per-seat fees on hosted plans; workspaces share organization allowances.", "Select a live hosted tier by run volume and searchable history, or operate your own deployment.", "MIT source can be modified; validate engine coverage, throughput and total usage costs."];
  return <section><h2>What changes when you choose TrackRank?</h2>
    <p>Compare the workload and operating model, not just the entry subscription.</p>
    <div className="comparison-table-wrap" role="region" aria-label="Product comparison" tabIndex={0}><table><thead><tr><th scope="col">Decision</th><th scope="col">{item.name}</th><th scope="col">TrackRank</th><th scope="col">Evidence</th></tr></thead>
      <tbody>{item.facts.map(([label, fact], index) => <tr key={label}><th scope="row">{label}</th><td>{fact}</td><td>{ourSide[index]}</td><td><a href={item.url}>Official product / pricing</a></td></tr>)}</tbody></table></div>
    <p className="comparison-note">Checked {item.checkedAt}. Packages may change. TrackRank publishes this comparison; it is not an independent review.</p>
  </section>;
}

function WorkloadMath({ item, catalog }: { item: Competitor; catalog: Catalog }) {
  return <section><h2>Compare the bill as your question list grows</h2>
    <p>Seats do not drive TrackRank pricing. This example uses 50, 150 and 350 questions, three engines, one sample daily, a 30-day month and 30 days of searchable history. The example uses <strong>Standard queue published rates</strong>: $0.0012 for each ChatGPT/Gemini result and a modeled $0.0018 Google request including both configured extras. That is $0.0042 per question across all three engines, not $0.01 per engine run.</p>
    <div className="comparison-table-wrap" role="region" aria-label="Workload cost examples" tabIndex={0}><table><thead><tr><th scope="col">Questions / monthly runs</th><th scope="col">TrackRank estimate</th><th scope="col">{item.name} reference</th>{item.slug === "peec-ai" && <th scope="col">Illustrative annual difference</th>}</tr></thead><tbody>
      {[50, 150, 350].map((prompts, index) => {
        const result = estimatePricing(catalog.offers, prompts, 3, 1, 30, profilePricing("all", "standard").perRun)!;
        const peec = [95, 245, 495][index];
        const reference = item.slug === "peec-ai" ? `${["Starter", "Pro", "Advanced"][index]}: $${peec}/month; ${prompts} prompts on 3 models daily.`
          : item.slug === "promptwatch" ? `${["Essential", "Professional", "Business"][index]}: $${[95, 245, 579][index]}/month; ${prompts} prompts. Response/model mix differs.`
          : item.slug === "ahrefs" ? "Custom tracking starts at $50/month; request the package for this check volume. The index is a separate product."
          : item.slug === "otterly-ai" ? "Lite €29 / 2,000 credits; Standard €189 / 15,000 credits. Check engine weights and package fit; no USD conversion."
          : "Custom enterprise quote. No public equivalent workload price verified.";
        return <tr key={prompts}><th scope="row">{prompts} questions<br />{result.runs.toLocaleString("en-US")} runs</th><td>{catalog.hosted && result.plan && result.total !== null ? <>{result.plan.name}: <strong>{money(result.total)}/month</strong><br />{money(result.plan.price_cents / 100)} hosting + {money(result.provider)} estimated provider usage</> : <>Self-host: $0 TrackRank subscription + {money(result.provider)} estimated provider usage + infrastructure.</>}</td><td>{reference}</td>{item.slug === "peec-ai" && <td>{catalog.hosted && result.total !== null ? <>{money(Math.abs((peec - result.total) * 12))} {peec >= result.total ? "lower" : "higher"} for TrackRank</> : "Not compared"}</td>}</tr>;
      })}
    </tbody></table></div>
    <p className="comparison-note">Competitor source: <a href={item.url}>{item.name} official product / pricing</a>, checked {item.checkedAt}. Example arithmetic only, not feature equivalence or guaranteed savings. Engine selection, samples, billing period, history, provider minimum deposits, optional analysis and taxes can change the result. Google async charges can be refunded when no asynchronous overview is returned; advanced search-operator surcharges are not included. All listed TrackRank hosted tiers have the same operational rate limits; a larger allowance does not mean faster execution.</p>
    <p>For your own deployment, total cost = infrastructure + collection + optional analysis; TrackRank software subscription = $0. For managed hosting, add the <a href="/pricing">current TrackRank subscription</a>. A higher provider rate can erase a subscription saving.</p>
    <p>Provider sources: <a href={llmPricingUrl}>LLM Scraper rates</a> and <a href={googlePricingUrl}>Google base rates and parameter charges</a>, checked November 23, 2026. These are modeled usage costs, not an invoice. <a href={providerBillingUrl}>DataForSEO’s $50 minimum top-up</a> is prepaid credit, separate from monthly consumption.</p>
    <h3>If you only monitor ChatGPT</h3><p>50 questions × 30 days = 1,500 ChatGPT results. Published collection costs are {money(1500 * llmRates.standard)} Standard, {money(1500 * llmRates.priority)} Priority or {money(1500 * llmRates.live)} Live. Add the applicable live TrackRank hosting subscription below, or your infrastructure if self-hosted. This single-engine workload is not equivalent to Peec’s three-model package.</p>
    <CostCalculator hosted={catalog.hosted} offers={catalog.offers} />
  </section>;
}

function Migration({ item, hosted }: { item: Competitor; hosted: boolean }) {
  return <section id="migration"><h2>Move a pilot question set from {item.name}</h2><p>Manual setup, not a one-click migration. Allow time to review coverage and collect a new baseline; historical answers are not imported.</p><ol>
    <li>{item.migration}</li>
    <li>Choose <a href={SELF_HOST_URL}>self-hosting</a>{hosted && <> or <a href="/login?trial=start">the hosted trial</a></>}. Add your own DataForSEO credentials in Settings → Providers. Optional OpenRouter analysis needs its own credentials.</li>
    <li>In Prompts → Add prompts, paste one question per line, choose supported engines and a client/brand workspace, and review the engine variants. Saving questions or a paused schedule does not launch paid collection.</li>
    <li>Review the run count and provider costs before explicitly collecting a small batch. Compare question wording, engine, location, time and source evidence; do not splice different products’ metrics into a single historical trend.</li>
    <li>Only recreate or enable recurring schedules once the pilot is useful. Preserve old reports and confirm the incumbent’s cancellation terms directly before ending a subscription.</li>
  </ol><a className="comparison-cta" href={hosted ? "/login?trial=start" : SELF_HOST_URL}>Set up a {item.name} pilot question set →</a></section>;
}

function CompetitorWins({ item }: { item: Competitor }) {
  return <section><h2>Where {item.name} is the better choice</h2><ul>{item.wins.map(win => <li key={win}>{win}</li>)}</ul><p><a href={item.winSource}>Check the features and package directly with {item.name}</a>.</p></section>;
}

function Questions({ item }: { item: Competitor }) {
  return <section><h2>Questions before switching</h2>{[...item.faqs, ["Can I self-host TrackRank for free?", "The MIT software has no license fee or TrackRank subscription for self-hosting. You still operate Cloudflare infrastructure and pay for collection and any other services you use."], ["Why can monitoring cost less at scale?", "TrackRank separates hosting from collection. A larger question list can fit a run-based allowance without a bundled per-prompt package. Actual savings depend on your provider rate, sampling, engine mix and required features."]].map(([q, a]) => <div key={q}><h3>{q}</h3><p>{a}</p></div>)}</section>;
}

export function ComparisonPage({ item, catalog }: { item: Competitor; catalog: Catalog }) {
  return <PublicLayout page="compare"><article className="comparison-article"><header><a href="/vs">← All comparisons</a><p className="comparison-eyebrow">TrackRank vs {item.name}</p><h1>TrackRank vs {item.name}: {item.angle}</h1>
    <p className="comparison-verdict">Pick {item.name} for {item.best}. Pick TrackRank for MIT-licensed source, your own provider credentials and run-based monitoring you can host yourself.</p>
    <p>{item.reason}</p></header><Facts item={item} /><WorkloadMath item={item} catalog={catalog} /><Migration item={item} hosted={catalog.hosted} /><CompetitorWins item={item} /><TrackRankDifference /><Questions item={item} />
    <section><h2>Still evaluating?</h2><p><a href={`/alternatives/${item.slug}`}>Compare {item.name} alternatives</a> or <a href="/pricing">review TrackRank pricing</a>.</p><HostingActions hosted={catalog.hosted} /></section>
  </article></PublicLayout>;
}

export function AlternativesPage({ item, catalog }: { item: Competitor; catalog: Catalog }) {
  const alternatives = competitors.filter(other => other.slug !== item.slug);
  return <PublicLayout page="compare"><article className="comparison-article"><header><a href="/alternatives">← All alternative guides</a><p className="comparison-eyebrow">{item.name} alternatives</p><h1>{item.name} alternatives for open-source control and cost-conscious monitoring</h1><p className="comparison-verdict">Start with TrackRank if you want MIT-licensed source, your own collection credentials and a choice of managed or self-hosted deployment. {item.reason}</p><p>This shortlist favors ownership and cost transparency, not a universal ranking. {item.name} remains worth choosing for {item.best}.</p></header>
    <section><h2>Five alternatives, each for a different job</h2>
      <article className="alternative-option"><h3>TrackRank — for ownership and controllable monitoring costs</h3><p><strong>Best for:</strong> teams comfortable with their own provider account, agencies managing client workspaces, and developers who want to inspect or change the code.</p><p><strong>Trade-off:</strong> three collection engines, separate provider charges and infrastructure responsibility if self-hosted. Not an enterprise-suite replacement.</p><p><strong>Starting cost:</strong> $0 TrackRank software subscription when self-hosted, plus infrastructure and usage.{catalog.hosted && catalog.offers.length > 0 && <> Managed hosting: {formatBillingPrice(catalog.offers[0])} plus provider usage.</>}</p><p><a href={REPOSITORY_URL}>MIT source</a> · <a href="/pricing">Live hosting catalog</a> · <a href={`/vs/${item.slug}`}>TrackRank vs {item.name}</a></p></article>
      {alternatives.map(other => <article className="alternative-option" key={other.slug}><h3>{other.name} — for {other.best}</h3><p><strong>Best for:</strong> {other.wins[0]}</p><p><strong>Trade-off:</strong> {other.tradeoff}</p><p><strong>Starting package:</strong> {other.facts[0][1]}</p><p><a href={other.url}>Official product and pricing</a> · <a href={`/vs/${other.slug}`}>Compare with TrackRank</a></p></article>)}
    </section><section><h2>How this shortlist was chosen</h2><p>We compared source ownership, provider-account control, supported engines, billing units, workflow scope and operator effort. Google product, alternatives and public discussion searches informed the research; live official pages control the product facts. Published by TrackRank and checked {item.checkedAt}. No claim of independently verified customer dissatisfaction or hands-on testing of competitor accounts.</p></section>
    <Facts item={item} /><TrackRankDifference /><WorkloadMath item={item} catalog={catalog} /><Migration item={item} hosted={catalog.hosted} /><CompetitorWins item={item} /><Questions item={item} />
  </article></PublicLayout>;
}

export function ComparisonIndex({ alternatives = false }: { alternatives?: boolean }) {
  return <PublicLayout page="compare"><article className="comparison-article"><header><p className="comparison-eyebrow">Open-source AI visibility tracking</p><h1>{alternatives ? "AI visibility tool alternatives" : "Compare TrackRank with AI visibility tools"}</h1><p>Choose by source ownership, provider costs, engine coverage and the work your team actually needs—not subscription price alone.</p></header><div className="comparison-index">{competitors.map(item => <section key={item.slug}><h2><a href={alternatives ? `/alternatives/${item.slug}` : `/vs/${item.slug}`}>{alternatives ? `${item.name} alternatives` : `TrackRank vs ${item.name}`}</a></h2><p>{item.angle}.</p><p>{item.reason}</p></section>)}</div><TrackRankDifference /><p><a href={alternatives ? "/vs" : "/alternatives"}>{alternatives ? "See head-to-head comparisons" : "Explore alternative shortlists"}</a> · <a href="/pricing">Pricing and cost calculator</a></p></article></PublicLayout>;
}
