import { useState } from "react";
import { formatBillingPrice } from "@/lib/billing-price";
import { estimatePricing, REPOSITORY_URL, type PricedPlan } from "@/lib/pricing-estimate";

type Offer = PricedPlan & { offer_key: string };
export function PricingSection({ hosted, offers }: { hosted: boolean; offers: Offer[] }) {
  return <section className="pricing-section" id="pricing" aria-labelledby="pricing-title">
    <p className="section-eyebrow">OPEN SOURCE. STRAIGHTFORWARD HOSTING.</p>
    <h2 id="pricing-title">All the features. Just choose your volume.</h2>
    <p className="pricing-intro">Self-host for free, or let us run TrackRank for your team. Hosted plans differ only in monthly prompt runs and searchable data retention—not features, seats, API or MCP access.</p>
    {hosted && <p><a className="button" href="/login?trial=start">Start your 14-day free trial →</a> No card. No automatic charge.</p>}
    <div className="pricing-grid">{offers.map(offer => <article className="pricing-card" key={offer.offer_key}>
      <h3>{offer.name}</h3><strong className="plan-price">{formatBillingPrice(offer)}</strong>
      <ul><li><strong>{offer.limits.runs_per_month.toLocaleString("en-US")}</strong> prompt runs / month</li>
      <li><strong>{offer.limits.searchable_history_days}</strong> days searchable history</li>
      <li>All product features · no per-seat fees</li></ul>
      <a className="button" href="/login?trial=start">Get started →</a>
    </article>)}</div>
    {!offers.length && <p>{hosted ? "Hosted subscriptions are not currently available. Contact us for options." : "This installation is self-hosted; no TrackRank subscription is required."}</p>}
    <div className="pricing-footnotes">
      <p><strong>One run = one prompt × one engine × one sample.</strong> Run allowances are shared across the organization and reset on the first of each calendar month (UTC). DataForSEO and optional OpenRouter usage are billed separately by those providers; these prices do not include that usage or applicable tax.</p>
      <p>Searchable retention controls run lists, research and CSV history. It is not automatic deletion of stored evidence. All plans share the same operational rate limits.</p>
      <p><strong>Need more runs or longer history?</strong> We offer custom higher-volume plans. <a href="mailto:info@trackrank.ai?subject=Custom%20TrackRank%20plan">Contact info@trackrank.ai</a>.</p>
      <p><a href={REPOSITORY_URL}>View the MIT-licensed source on GitHub</a> · <a href={REPOSITORY_URL + "/blob/main/docs/SELF_HOSTING.md"}>Self-host on your own Cloudflare account</a>. No software subscription; infrastructure and provider costs still apply.</p>
    </div>
  </section>;
}
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
export function CostCalculator({ offers }: { offers: Offer[] }) {
  const [prompts, setPrompts] = useState(50), [engines, setEngines] = useState(3), [samples, setSamples] = useState(1), [history, setHistory] = useState(30), [rate, setRate] = useState("0.01");
  const estimate = estimatePricing(offers, prompts, engines, samples, history, rate.trim() ? Number(rate) : NaN);
  return <section className="cost-section" id="calculator" aria-labelledby="calculator-title">
    <p className="section-eyebrow">YOUR VOLUME. YOUR MATH.</p><h2 id="calculator-title">See what you could save.</h2>
    <p>A 30-day planning estimate, including your estimated provider cost. Change the inputs to match your workload.</p>
    <div className="calculator-inputs">
      <label>Unique prompts<input type="number" min="1" max="1000000" value={prompts || ""} onChange={e => setPrompts(e.target.valueAsNumber)} /></label>
      <label>Engines per prompt<input type="number" min="1" max="3" value={engines || ""} onChange={e => setEngines(e.target.valueAsNumber)} /></label>
      <label>Samples per engine / day<input type="number" min="1" max="10" value={samples || ""} onChange={e => setSamples(e.target.valueAsNumber)} /></label>
      <label>Searchable history<select value={history} onChange={e => setHistory(Number(e.target.value))}><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option></select></label>
      <label>Estimated provider cost / run (USD)<input type="number" min="0" step="0.001" value={rate} onChange={e => setRate(e.target.value)} /></label>
    </div>
    <p className="data-note">$0.01/run is an illustrative editable assumption, not a provider quote. Engine, execution mode, options and optional analysis affect your actual bill. Provider minimum deposits and taxes are not modeled.</p>
    <div className="calculator-results" aria-live="polite">{!estimate ? <p>Enter valid positive whole-number volumes and a nonnegative provider rate.</p> : <>
      <article><h3>Your workload</h3><strong>{estimate.runs.toLocaleString("en-US")}</strong><p>prompt runs over 30 days</p></article>
      <article><h3>TrackRank {estimate.plan?.name || "Custom"}</h3><strong>{estimate.total !== null ? usd(estimate.total) + "/mo" : "Contact us"}</strong><p>{estimate.plan ? `${usd(estimate.plan.price_cents / 100)} subscription + ${usd(estimate.provider)} estimated provider usage` : "Your workload or history needs a custom plan."}</p></article>
      <article><h3>Peec AI {estimate.alternative?.name || "comparison"}</h3><strong>{estimate.alternative ? usd(estimate.alternative.price) + "/mo" : "Custom comparison"}</strong><p>{estimate.alternative ? `Published daily-tracking package, up to ${estimate.alternative.prompts} prompts on 3 models.` : "Published packages below apply to 3 engines and one daily sample, up to 350 prompts. No invented extrapolation."}</p></article>
      {estimate.savings !== null && <p className="calculator-saving">{estimate.savings > 0 ? `Estimated saving: ${usd(estimate.savings)}/month (${Math.round(estimate.savings / estimate.alternative!.price * 100)}%).` : estimate.savings < 0 ? `TrackRank is ${usd(-estimate.savings)}/month higher with these inputs.` : "Estimated monthly costs are equal."}</p>}
    </>}</div>
    <p className="pricing-footnotes">This is a tracking-volume cost comparison, not feature or engine equivalence. Competitor packages include different tools and may have different history limits; the history selector selects your TrackRank plan only. <a href="https://peec.ai/pricing">Peec AI monthly brand pricing</a> checked November 21, 2026. Actual offers can change.</p>
  </section>;
}
export function AlternativesComparison({ offers }: { offers: Offer[] }) {
  const entry = offers.filter(o => o.currency === "usd" && o.interval === "month").sort((a,b) => a.price_cents-b.price_cents)[0];
  return <section className="comparison-section" id="compare" aria-labelledby="compare-title">
    <p className="section-eyebrow">A DIFFERENT WAY TO PAY FOR VISIBILITY</p><h2 id="compare-title">Pay for hosting. Own your provider relationship.</h2>
    <p>TrackRank separates the software subscription from collection costs. Choose it for transparent costs, inspectable code and control—not a promise that every product is identical.</p>
    <div className="comparison-scroll" role="region" aria-label="AI visibility platform comparison" tabIndex={0}><table>
      <caption>Published monthly plans, checked November 21, 2026. USD unless marked EUR.</caption>
      <thead><tr><th scope="col">Platform</th><th scope="col">Entry subscription</th><th scope="col">Tracking allowance</th><th scope="col">Cost model / source</th></tr></thead>
      <tbody><tr><th scope="row">TrackRank {entry?.name || "self-hosted"}</th><td>{entry ? formatBillingPrice(entry) + " + provider usage" : "No software subscription; infrastructure + provider usage"}</td><td>{entry ? `${entry.limits.runs_per_month.toLocaleString("en-US")} runs/month · ${entry.limits.searchable_history_days}-day searchable history` : "Operator-configured limits"}</td><td><a href={REPOSITORY_URL}>MIT open source; self-host or use hosted plans</a></td></tr>
      <tr><th scope="row">Peec AI Starter</th><td>$95/month</td><td>50 prompts × 3 models, daily</td><td><a href="https://peec.ai/pricing">Published brand package</a></td></tr>
      <tr><th scope="row">OtterlyAI Lite</th><td>€29/month (EUR)</td><td>2,000 credits/month; 16 prompts on 4 engines, daily</td><td><a href="https://otterly.ai/pricing">Published package; engine choice affects prompt count</a></td></tr>
      <tr><th scope="row">Profound Enterprise</th><td>Custom quote</td><td>Custom prompt tracking</td><td><a href="https://www.tryprofound.com/pricing">Enterprise marketing and visibility package</a></td></tr></tbody>
    </table></div>
    <p className="pricing-footnotes">Different feature sets, supported engines, retention and billing units. No currency conversion or undisclosed enterprise prices assumed. Compare the capabilities you need before choosing.</p>
  </section>;
}
