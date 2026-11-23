import { profilePricing, llmPricingUrl, googlePricingUrl, providerBillingUrl, providerPricingCheckedAt, type CollectionProfile, type CollectionMode } from "@/lib/provider-pricing";
import { useState, type ReactNode } from "react";
import { HostingActions, SELF_HOST_URL } from "@/components/public-layout";
import { formatBillingPrice } from "@/lib/billing-price";
import { estimatePricing, REPOSITORY_URL, type PricedPlan } from "@/lib/pricing-estimate";

type Offer = PricedPlan & { offer_key: string };
export function PricingSection({ hosted, offers, standalone = false }: { hosted: boolean; offers: Offer[]; standalone?: boolean }) {
  const Heading = standalone ? "h1" : "h2";
  const PlanHeading = standalone ? "h2" : "h3";
  return <section className={`pricing-section${standalone ? " pricing-standalone" : ""}`} id="pricing" aria-labelledby="pricing-title">
    {hosted && offers.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org", "@type": "SoftwareApplication",
      name: "TrackRank", applicationCategory: "BusinessApplication", operatingSystem: "Web",
      description: "Open-source AI visibility tracking. Hosted subscription prices exclude tax and separately billed provider usage.",
      offers: offers.map(offer => ({
        "@type": "Offer", name: offer.name, price: offer.price_cents / 100,
        priceCurrency: offer.currency.toUpperCase(),
        description: `${offer.limits.runs_per_month} prompt runs per ${offer.interval}; ${offer.limits.searchable_history_days ?? "unlimited"} days searchable history. Provider usage billed separately.`,
        priceSpecification: { "@type": "UnitPriceSpecification", price: offer.price_cents / 100, priceCurrency: offer.currency.toUpperCase(), unitText: offer.interval },
      })),
    }).replace(/</g, "\\u003c") }} />}
    <Heading id="pricing-title">{hosted ? "Hosted plans" : "Self-host TrackRank"}</Heading>
    {hosted && <p className="pricing-intro">Choose your monthly run allowance and searchable history. Every plan includes all features, the same operational rate limits and no per-seat fees.</p>}
    {hosted && offers.length > 0 && <div className="pricing-grid">
      {offers.map(offer => <article className="pricing-card" key={offer.offer_key}>
        <PlanHeading>{offer.name}</PlanHeading>
        <p className="plan-price">{formatBillingPrice(offer)}</p>
        <dl>
          <div><dt>Prompt runs per month</dt><dd>{offer.limits.runs_per_month.toLocaleString("en-US")}</dd></div>
          <div><dt>Searchable history</dt><dd>{offer.limits.searchable_history_days === undefined ? "Unlimited" : `${offer.limits.searchable_history_days} days`}</dd></div>
        </dl>
      </article>)}
    </div>}
    {hosted && !offers.length && <p className="public-offer-status">Hosted subscriptions are currently unavailable.</p>}
    {hosted && offers.length > 0 && <p className="public-pricing-costs">Subscription prices are per organization, before tax. Provider usage is billed separately.</p>}
    <HostingActions hosted={hosted} />
    {hosted && <div className="pricing-footnotes">
      <p><strong>One run is one prompt × one engine × one sample.</strong> The organization shares its allowance, which resets on the first day of each calendar month (UTC). Optional OpenRouter analysis incurs separate provider charges.</p>
      <p>Searchable history limits the range available in run lists, research and CSV exports. Stored evidence remains available through authorized direct links.</p>
      <p><strong>Need more runs or longer history?</strong> <a href="mailto:info@trackrank.ai?subject=Custom%20TrackRank%20plan">Contact info@trackrank.ai</a> for a custom plan.</p>
    </div>}
    {!hosted && <p className="pricing-footnotes">Self-hosting requires no TrackRank subscription. <a href={REPOSITORY_URL}>View the MIT-licensed source on GitHub</a> or <a href={SELF_HOST_URL}>read the deployment guide</a>.</p>}
  </section>;
}
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
export function CostCalculator({ hosted, offers }: { hosted: boolean; offers: Offer[] }) {
  const [prompts, setPrompts] = useState("50");
  const [engines, setEngines] = useState("3");
  const [samples, setSamples] = useState("1");
  const [history, setHistory] = useState(30);
  const [rate, setRate] = useState("0.01");
  const [profile, setProfile] = useState<CollectionProfile>("all");
  const [mode, setMode] = useState<CollectionMode>("standard");
  const preset = profile === "custom" ? null : profilePricing(profile, mode);
  const engineCount = preset?.engines ?? Number(engines);
  const effectiveRate = preset?.perRun ?? (rate.trim() ? Number(rate) : NaN);
  const estimate = estimatePricing(offers, Number(prompts), engineCount, Number(samples), history, effectiveRate);
  return <section className="cost-section" id="calculator" aria-labelledby="calculator-title">
    <h2 id="calculator-title">Estimate your monthly cost</h2>
    <p>A 30-day planning estimate, including your estimated provider cost. Change the inputs to match your workload.</p>
    <div className="calculator-inputs">
      <label>Unique prompts<input type="number" min="1" max="1000000" value={prompts} onChange={e => setPrompts(e.target.value)} /></label>
      <label>Collection profile<select value={profile} onChange={e => setProfile(e.target.value as CollectionProfile)}><option value="all">ChatGPT + Gemini + Google AI Overviews</option><option value="chatgpt">ChatGPT only</option><option value="gemini">Gemini only</option><option value="google">Google AI Overviews only</option><option value="custom">Custom blended rate</option></select></label>
      {profile !== "custom" && <label>Execution mode<select value={mode} onChange={e => setMode(e.target.value as CollectionMode)}><option value="standard">Standard queue</option><option value="priority">Priority queue</option><option value="live">Live</option></select></label>}
      {profile === "custom" && <label>Engines per prompt<input type="number" min="1" max="3" value={engines} onChange={e => setEngines(e.target.value)} /></label>}
      <label>Samples per engine / day<input type="number" min="1" max="10" value={samples} onChange={e => setSamples(e.target.value)} /></label>
      {hosted && <label>Searchable history<select value={history} onChange={e => setHistory(Number(e.target.value))}><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option></select></label>}
      {profile === "custom" && <label>Estimated provider cost / run (USD)<input type="number" min="0" step="0.0001" value={rate} onChange={e => setRate(e.target.value)} /></label>}
    </div>
    <p className="data-note">Presets use published <a href={llmPricingUrl}>ChatGPT/Gemini</a> and <a href={googlePricingUrl}>Google Organic</a> list rates, checked {providerPricingCheckedAt}. Google budgets depth 10 plus AI Overview loading and poisoned-result resolution; unused async loading may be refunded. Search operators, optional analysis and taxes are excluded. Custom rates are your assumptions. <a href={providerBillingUrl}>DataForSEO requires a $50 minimum top-up</a>; that is prepaid credit, not a monthly fee.</p>
    <div className="calculator-results" aria-live="polite">{!estimate ? <p>Use 1-1,000,000 prompts, 1-3 engines and 1-10 samples. Enter whole numbers for volumes and a provider rate of zero or more.</p> : <>
      <article><h3>Your workload</h3><strong>{estimate.runs.toLocaleString("en-US")}</strong><p>prompt runs over 30 days</p></article>
      {hosted && offers.length > 0 ? (
        <article><h3>TrackRank {estimate.plan?.name || "Custom"}</h3><strong>{estimate.total !== null ? usd(estimate.total) + "/mo" : "Contact us"}</strong><p>{estimate.plan ? `${usd(estimate.plan.price_cents / 100)} subscription + ${usd(estimate.provider)} estimated provider usage` : "Your workload or history needs a custom plan."}</p></article>
      ) : (
        <article><h3>Estimated provider usage</h3><strong>{usd(estimate.provider)}</strong><p>{hosted ? "Hosted subscriptions are currently unavailable." : "Self-hosting has no software subscription. Add your own Cloudflare infrastructure costs."}</p></article>
      )}
      <article><h3>Peec AI {estimate.alternative?.name || "comparison"}</h3><strong>{estimate.alternative ? usd(estimate.alternative.price) + "/mo" : "Custom comparison"}</strong><p>{estimate.alternative ? `Published daily-tracking package, up to ${estimate.alternative.prompts} prompts on 3 models.` : "Published packages cover up to 350 prompts, with 3 engines and one daily sample."}</p></article>
      {hosted && estimate.savings !== null && <p className="calculator-saving">{estimate.savings > 0 ? `Estimated saving: ${usd(estimate.savings)}/month (${Math.round(estimate.savings / estimate.alternative!.price * 100)}%).` : estimate.savings < 0 ? `TrackRank is ${usd(-estimate.savings)}/month higher with these inputs.` : "Estimated monthly costs are equal."}</p>}
    </>}</div>
    <p className="pricing-footnotes">This estimate compares costs for the selected tracking volume. Features, engines and searchable history vary by platform. <a href="https://peec.ai/pricing">Peec AI monthly brand pricing</a> checked November 23, 2026. Actual offers can change.</p>
  </section>;
}
export function AlternativesComparison({ hosted, offers }: { hosted: boolean; offers: Offer[] }) {
  const entry = offers.filter(offer => offer.currency === "usd" && offer.interval === "month").sort((a, b) => a.price_cents-b.price_cents)[0];
  const labels = ["Entry subscription", "Tracking allowance", "Cost model and source"];
  const rows: { name: string; values: [string, string, ReactNode] }[] = [
    {
      name: entry ? `TrackRank ${entry.name}` : "TrackRank self-hosted",
      values: [
        entry ? `${formatBillingPrice(entry)} + provider usage` : "Infrastructure + provider usage",
        entry ? `${entry.limits.runs_per_month.toLocaleString("en-US")} runs/month · ${entry.limits.searchable_history_days === undefined ? "unlimited history" : `${entry.limits.searchable_history_days}-day searchable history`}` : "Self-host limits are operator-configured",
        <a href={REPOSITORY_URL}>MIT source and deployment options</a>,
      ],
    },
    { name: "Peec AI Starter", values: ["$95/month", "50 prompts × 3 models, daily", <a href="https://peec.ai/pricing">Published brand package</a>] },
    { name: "OtterlyAI Lite", values: ["€29/month (EUR)", "2,000 credits/month · 16 prompts on 4 engines, daily", <a href="https://otterly.ai/pricing">Published package. Engine choice affects prompt count.</a>] },
    { name: "Profound Enterprise", values: ["Custom quote", "Custom prompt tracking", <a href="https://www.tryprofound.com/pricing">Enterprise marketing and visibility package</a>] },
  ];
  const comparisonDate = "Published monthly plans, checked November 21, 2026. USD unless marked EUR.";
  return <section className="comparison-section" id="compare" aria-labelledby="compare-title">
    <h2 id="compare-title">Compare tracking packages</h2>
    <p>{hosted ? "TrackRank bills for hosting. You pay collection costs directly to DataForSEO." : "Self-hosting requires your own Cloudflare and DataForSEO accounts. You pay their usage charges directly."}</p>
    <table className="public-comparison-table">
      <caption>{comparisonDate}</caption>
      <thead><tr><th scope="col">Platform</th>{labels.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.name}>
        <th scope="row">{row.name}</th>
        {row.values.map((value, index) => <td key={labels[index]}>{value}</td>)}
      </tr>)}</tbody>
    </table>
    <div className="public-comparison-list">
      <p>{comparisonDate}</p>
      {rows.map(row => <section key={row.name}>
        <h3>{row.name}</h3>
        <dl>{row.values.map((value, index) => <div key={labels[index]}><dt>{labels[index]}</dt><dd>{value}</dd></div>)}</dl>
      </section>)}
    </div>
    <p className="pricing-footnotes">Features, supported engines, history and billing units vary. Prices reflect published offers in their original currencies.</p>
  </section>;
}
