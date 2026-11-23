import { comparisonCost, type CostExample } from "@/lib/comparison-cost";
import { llmPricingUrl, googlePricingUrl, providerBillingUrl } from "@/lib/provider-pricing";
import { competitors, type Competitor } from "@/data/competitors";
import { PublicLayout, HostingActions, SELF_HOST_URL } from "./public-layout";
import { CostCalculator } from "./pricing-section";
import { REPOSITORY_URL, type PricedPlan } from "@/lib/pricing-estimate";
import "./comparison-pages.css";

type Catalog = { hosted: boolean; offers: (PricedPlan & { offer_key: string })[] };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

function CostFigure({ catalog, example, details = true }: { catalog: Catalog; example: CostExample; details?: boolean }) {
  const cost = comparisonCost(catalog.offers, example);
  const { standard, live } = cost;
  const range = (low: number, high: number) => `${money(low)}-${money(high)}/month`;
  return <span className="comparison-cost-figure">
    {catalog.hosted ? standard.total !== null && live.total !== null ? <>
      <strong>Estimated {range(standard.total, live.total)} hosted</strong>
      {details && <span>{standard.plan!.name} hosting {money(standard.plan!.price_cents / 100)}/month + estimated {range(standard.provider, live.provider)} provider usage.</span>}
    </> : <><strong>Hosted pricing requires a quote</strong><span>Estimated provider usage: {range(standard.provider, live.provider)}, plus hosting.</span></> : <>
      <strong>Estimated {range(standard.provider, live.provider)} provider usage + infrastructure</strong>
      {details && <span>TrackRank software subscription: $0 for self-hosting. Infrastructure is additional.</span>}
    </>}
    <span>{example.questions.toLocaleString("en-US")} questions, {({ all: "ChatGPT + Gemini + Google AI Overviews", chatgpt: "ChatGPT", gemini: "Gemini", google: "Google AI Overviews" })[cost.profile]}, one daily sample per engine, 30 days.</span>
    {details && <span>Range: Standard queue to Live. Budget includes Google extras when selected; actual charges may be lower after refunds.</span>}
  </span>;
}

function TrackRankDifference() {
  return <section><h2>What can you change or self-host with TrackRank?</h2>
    <p>TrackRank is <a href={`${REPOSITORY_URL}/blob/main/LICENSE`}>MIT-licensed</a>. Inspect it, fork it and adapt the code to your reporting workflow. <a href={SELF_HOST_URL}>Self-host on your own Cloudflare account</a> with no TrackRank software subscription, or use managed hosting.</p>
    <p>Bring your own DataForSEO credentials for ChatGPT, Gemini and Google AI Overviews collection. Optional OpenRouter analysis is separate. You pay the provider directly, so hosting and collection spending stay visible instead of being bundled into a fixed prompt package.</p>
    <p>The MIT license costs $0. You pay for any Cloudflare, email and provider usage. The supported deployment is Cloudflare Workers, D1, R2 and Workflows; standalone Docker/VPS deployment is not implemented.</p>
    <p>Paste questions in bulk and group clients in workspaces. Collect multiple samples and save schedules paused until you choose to enable them. Export CSV files or read organization data through REST and MCP. Hosted run limits and provider costs still apply. <a href={`${REPOSITORY_URL}/blob/main/docs/API.md`}>Read the API and MCP guide</a>.</p>
  </section>;
}

function Facts({ item, catalog }: { item: Competitor; catalog: Catalog }) {
  return <section><h2>What changes when you choose TrackRank?</h2>
    <p>{catalog.hosted ? "Dollar ranges include the hosted subscription and modeled provider usage, from Standard queue to Live." : "Self-hosted ranges cover provider usage from Standard queue to Live; add your infrastructure costs."} Each estimate names its workload. Credits, engines and bundled capabilities differ between products.</p>
    <div className="comparison-table-wrap" role="region" aria-label="Product comparison" tabIndex={0}><table><thead><tr><th scope="col">Decision</th><th scope="col">{item.name}</th><th scope="col">TrackRank</th><th scope="col">Evidence</th></tr></thead>
      <tbody>{item.facts.map(([label, fact], index) => <tr key={label}><th scope="row">{label}</th><td>{fact}</td><td>{typeof item.trackrankFacts[index] === "string" ? item.trackrankFacts[index] : <CostFigure catalog={catalog} example={item.trackrankFacts[index]} />}</td><td><a href={item.url}>Official product / pricing</a></td></tr>)}</tbody></table></div>
    <p className="comparison-note">Checked {item.checkedAt}. Packages may change. TrackRank publishes this comparison; it is not an independent review. TrackRank costs use the <a href="/pricing">live hosting catalog</a> and <a href={llmPricingUrl}>LLM Scraper</a>/<a href={googlePricingUrl}>Google Organic</a> rates.</p>
  </section>;
}

function WorkloadMath({ item, catalog }: { item: Competitor; catalog: Catalog }) {
  return <section><h2>How much does daily tracking cost?</h2>
    <p>Seats do not drive TrackRank pricing. Every TrackRank dollar total below includes hosting and provider usage when managed hosting is enabled. The table uses three engines and one daily sample per question. Each estimate covers 30 days and a 30-day searchable-history window. Columns show Standard, Priority and Live using published list rates. Standard collection costs a modeled $0.0042 per question across all three engines; hosting is additional to that provider subtotal.</p>
    <div className="comparison-table-wrap" role="region" aria-label="Workload cost examples" tabIndex={0}><table><thead><tr><th scope="col">Daily questions</th><th scope="col">TrackRank Standard</th><th scope="col">TrackRank Priority</th><th scope="col">TrackRank Live</th><th scope="col">{item.name} reference</th></tr></thead><tbody>
      {item.comparisonQuestions.map((questions, index) => {
        const cost = comparisonCost(catalog.offers, { questions });
        const reference = item.slug === "peec-ai" ? `${["Starter", "Pro", "Advanced"][index]}: $${[95,245,495][index]}/month; ${questions} prompts on three models daily.`
          : item.slug === "promptwatch" ? `${["Essential", "Professional", "Business"][index]}: $${[95,245,579][index]}/month; ${questions} prompts. Response/model mix differs.`
          : item.slug === "ahrefs" ? "Custom tracking starts at $50/month. Ask Ahrefs for this workload's price. The index starts at $199/month and is a separate product."
          : item.slug === "otterly-ai" ? `${["Lite", "Standard", "Premium"][index]}: €${[29,189,489][index]}/month; ${questions} prompts illustrated on four engines. TrackRank here uses three engines. No currency conversion.`
          : "Custom enterprise quote. Profound does not publish a numeric range for this workload.";
        return <tr key={questions}><th scope="row">{questions} questions<br /><small>{cost.standard.runs.toLocaleString("en-US")} monthly runs</small></th>{(["standard","priority","live"] as const).map(mode => {
          const result = cost[mode];
          return <td key={mode}>{catalog.hosted ? result.total !== null && result.plan ? <><strong>{money(result.total)}/month</strong><br />{result.plan.name}: {money(result.plan.price_cents / 100)} hosting + {money(result.provider)} provider budget</> : <>Hosting quote + {money(result.provider)}/month provider budget</> : <><strong>{money(result.provider)}/month + infrastructure</strong><br />$0 TrackRank software subscription</>}</td>;
        })}<td>{reference}</td></tr>;
      })}
    </tbody></table></div>
    <p className="comparison-note">Competitor source: <a href={item.url}>{item.name} official product / pricing</a>, checked {item.checkedAt}. The packages cover different engines and workflows. These calculations do not guarantee savings. Engine selection, samples, billing period, history, provider minimum deposits, optional analysis and taxes can change the result. DataForSEO refunds unused asynchronous-overview charges. These estimates exclude advanced search-operator surcharges. All listed TrackRank hosted tiers have the same operational rate limits; a larger allowance does not mean faster execution.</p>
    <p>For your own deployment, total cost = infrastructure + collection + optional analysis; TrackRank software subscription = $0. For managed hosting, add the <a href="/pricing">current TrackRank subscription</a>. A higher provider rate can erase a subscription saving.</p>
    <p>Provider sources: <a href={llmPricingUrl}>LLM Scraper rates</a> and <a href={googlePricingUrl}>Google base rates and parameter charges</a>, checked November 23, 2026. These estimates use published list rates. <a href={providerBillingUrl}>DataForSEO's $50 minimum top-up</a> is prepaid credit, separate from monthly consumption.</p>
    <h3>What does ChatGPT-only tracking cost?</h3><p><CostFigure catalog={catalog} example={{ questions: 50, profile: "chatgpt" }} /> This single-engine workload has less coverage than a three-model package.</p>
    <CostCalculator hosted={catalog.hosted} offers={catalog.offers} />
  </section>;
}

function Migration({ item, hosted }: { item: Competitor; hosted: boolean }) {
  return <section id="migration"><h2>Move a pilot question set from {item.name}</h2><p>Copy a small question set and collect a new baseline. TrackRank does not import historical answers from this product.</p><ol>
    <li>{item.migration}</li>
    <li>Choose <a href={SELF_HOST_URL}>self-hosting</a>{hosted && <> or <a href="/login?trial=start">the hosted trial</a></>}. Add your own DataForSEO credentials in Settings → Providers. Optional OpenRouter analysis needs its own credentials.</li>
    <li>In Prompts → Add prompts, paste one question per line, choose supported engines and a client/brand workspace, and review the engine variants. Saving questions or a paused schedule does not launch paid collection.</li>
    <li>Review the run count and provider costs before explicitly collecting a small batch. Match the question, engine and location before comparing answers. Keep the old product's metrics separate from the new baseline.</li>
    <li>Enable recurring schedules after reviewing the pilot answers. Preserve old reports and confirm the incumbent's cancellation terms directly before ending a subscription.</li>
  </ol><a className="comparison-cta" href={hosted ? "/login?trial=start" : SELF_HOST_URL}>Set up a {item.name} pilot question set →</a></section>;
}

function CompetitorWins({ item }: { item: Competitor }) {
  return <section><h2>When should you choose {item.name}?</h2><p>{item.alternativeVerdict}</p><ul>{item.wins.map(win => <li key={win}>{win}</li>)}</ul><p><a href={item.winSource}>Check the features and package directly with {item.name}</a>.</p></section>;
}

function Questions({ item }: { item: Competitor }) {
  return <section><h2>Questions before switching</h2>{[...item.faqs, ["Can I self-host TrackRank for free?", "The MIT software has no license fee or TrackRank subscription for self-hosting. You still operate Cloudflare infrastructure and pay for collection and any other services you use."], ["Why can monitoring cost less at scale?", "TrackRank separates hosting from collection. A larger question list can fit a run-based allowance without a bundled per-prompt package. Actual savings depend on your provider rate, sampling, engine mix and required features."]].map(([q, a]) => <div key={q}><h3>{q}</h3><p>{a}</p></div>)}</section>;
}

export function ComparisonPage({ item, catalog }: { item: Competitor; catalog: Catalog }) {
  return <PublicLayout page="compare"><article className="comparison-article"><header><a href="/vs">← All comparisons</a><p className="comparison-eyebrow">TrackRank vs {item.name}</p><h1>TrackRank vs {item.name}: {item.angle}</h1>
    <p className="comparison-verdict">Choose {item.name} for {item.best}. Choose TrackRank to modify MIT-licensed code, bring your DataForSEO credentials or self-host.</p>
    <p className="comparison-cost-lead"><CostFigure catalog={catalog} example={{ questions: item.comparisonQuestions[0] }} /></p><p>{item.reason}</p></header><Facts item={item} catalog={catalog} /><WorkloadMath item={item} catalog={catalog} /><Migration item={item} hosted={catalog.hosted} /><CompetitorWins item={item} /><TrackRankDifference /><Questions item={item} />
    <section><h2>Try TrackRank with your questions</h2><p><a href={`/alternatives/${item.slug}`}>Compare {item.name} alternatives</a> or <a href="/pricing">review TrackRank pricing</a>.</p><HostingActions hosted={catalog.hosted} /></section>
  </article></PublicLayout>;
}

export function AlternativesPage({ item, catalog }: { item: Competitor; catalog: Catalog }) {
  const alternatives = competitors.filter(other => other.slug !== item.slug);
  return <PublicLayout page="compare"><article className="comparison-article"><header><a href="/alternatives">← All alternative guides</a><p className="comparison-eyebrow">{item.name} alternatives</p><h1>{item.alternativeHeading}</h1><p className="comparison-verdict">Choose <a href="/">TrackRank</a> for MIT-licensed code, your DataForSEO credentials and self-hosting without a software subscription. {item.reason}</p><p>This shortlist prioritizes source access and separate hosting and collection bills. {item.name} remains worth choosing for {item.best}.</p><p className="comparison-cost-lead"><CostFigure catalog={catalog} example={{ questions: item.comparisonQuestions[0] }} /></p></header>
    <section><h2>Five alternatives, each for a different job</h2>
      <article className="alternative-option"><h3>TrackRank for self-hosting and provider-account control</h3><p><strong>Verdict:</strong> Modify the MIT code or run it in your Cloudflare account without a TrackRank subscription.</p><p><strong>Best for:</strong> teams comfortable with their own provider account, agencies managing client workspaces, and developers who want to inspect or change the code.</p><p><strong>Trade-off:</strong> three collection engines, separate provider charges and infrastructure responsibility if self-hosted. Not an enterprise-suite replacement.</p><p><strong>Example monthly cost:</strong> <CostFigure catalog={catalog} example={{ questions: item.comparisonQuestions[0] }} /></p><p>Self-hosting has a $0 TrackRank software fee. You still pay for provider usage and your infrastructure.</p><p><a href={REPOSITORY_URL}>MIT source</a> · <a href="/pricing">Live hosting catalog</a> · <a href={`/vs/${item.slug}`}>TrackRank vs {item.name}</a></p></article>
      {alternatives.map(other => <article className="alternative-option" key={other.slug}><h3>{other.name}</h3><p><strong>Verdict:</strong> {other.alternativeVerdict}</p><p><strong>Best for:</strong> {other.wins[0]}</p><p><strong>Trade-off:</strong> {other.tradeoff}</p><p><strong>Starting package:</strong> {other.facts[0][1]}</p><p><a href={other.url}>Official product and pricing</a> · <a href={`/vs/${other.slug}`}>Compare with TrackRank</a></p></article>)}
    </section><section><h2>How did we choose these alternatives?</h2><p>We prioritized source access and separate collection billing. We also checked engine coverage, billing units and the work needed to run each tool. We searched Google for each product and alternatives. The linked official product and pricing pages support the package details. Published by TrackRank and checked {item.checkedAt}. We did not test paid competitor accounts.</p></section>
    <Facts item={item} catalog={catalog} /><TrackRankDifference /><WorkloadMath item={item} catalog={catalog} /><Migration item={item} hosted={catalog.hosted} /><CompetitorWins item={item} /><Questions item={item} />
  </article></PublicLayout>;
}

export function ComparisonIndex({ alternatives = false }: { alternatives?: boolean }) {
  return <PublicLayout page="compare"><article className="comparison-article"><header><p className="comparison-eyebrow">Open-source AI visibility tracking</p><h1>{alternatives ? "AI visibility tool alternatives" : "Compare TrackRank with AI visibility tools"}</h1><p><a href="/">TrackRank</a> lets you modify MIT-licensed code and collect answers with your DataForSEO account. Use these guides to compare that approach with managed monitoring packages.</p></header><div className="comparison-index">{competitors.map(item => <section key={item.slug}><h2><a href={alternatives ? `/alternatives/${item.slug}` : `/vs/${item.slug}`}>{alternatives ? `${item.name} alternatives` : `TrackRank vs ${item.name}`}</a></h2><p>{item.angle}.</p><p>{item.reason}</p></section>)}</div><TrackRankDifference /><p><a href={alternatives ? "/vs" : "/alternatives"}>{alternatives ? "See head-to-head comparisons" : "Explore alternative shortlists"}</a> · <a href="/pricing">Pricing and cost calculator</a></p></article></PublicLayout>;
}
