import { AlternativesComparison, CostCalculator, PricingSection } from "@/components/pricing-section";
import { EvidenceReport } from "@/components/evidence-report";
import { HostingActions, PublicLayout } from "@/components/public-layout";
import { getPricingCatalog } from "@/server/site-config";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/")({ loader: () => getPricingCatalog(), head: ({ loaderData }) => ({
  meta: [{ title: "Open-Source AI Visibility Tracking — Trackrank AI" }],
  links: loaderData ? [{ rel: "canonical", href: `${loaderData.origin}/` }] : [],
}), component: Home });

function ExampleAnswer() {
  return <section className="public-example" aria-labelledby="example-question">
    <p className="public-example-label">Illustrative collection · sample answer</p>
    <h2 id="example-question">Which design tools let clients comment on a shared prototype?</h2>
    <dl className="public-example-context">
      <div><dt>Engine</dt><dd>ChatGPT</dd></div>
      <div><dt>Location</dt><dd>United States</dd></div>
      <div><dt>Language</dt><dd>English</dd></div>
    </dl>
    <EvidenceReport
      illustrative
      answer="Penpot lets teams share a prototype by link. When commenting is enabled in the link permissions, people outside the team can leave feedback directly on the prototype."
      observations={[{ label: "Tracked brand", value: "Penpot · Mentioned" }]}
      sources={[{ title: "Penpot User Guide · Testing: View mode", url: "https://help.penpot.app/user-guide/prototyping-testing/testing-view-mode/" }]}
    />
  </section>;
}

function Home() {
  const { hosted, offers } = Route.useLoaderData();
  return <PublicLayout page="home">
    <section className="public-hero" aria-labelledby="public-title">
      <div className="public-hero-copy">
        <h1 id="public-title">See where your brand appears in <em>AI answers.</em></h1>
        <p className="public-hero-description">Track the questions your customers ask across ChatGPT, Gemini and Google AI Overviews. Show where your brand comes up, with the recorded answer and cited sources.</p>
        <HostingActions hosted={hosted} />
        <a className="public-product-link" href="#product">How tracking works <ArrowDown size={16} aria-hidden="true" /></a>
      </div>
      <ExampleAnswer />
    </section>
    <section className="public-product" id="product" aria-labelledby="public-product-title">
      <div>
        <h2 id="public-product-title">From a customer question to a finding you can share</h2>
        <p>Trackrank AI is open source under the MIT license. Use the hosted service or deploy the same application in your own Cloudflare account.</p>
        <a href="/pricing">See pricing and hosting options <ArrowUpRight size={15} aria-hidden="true" /></a>
      </div>
      <ol>
        <li><h3>Set up monitoring</h3><p>Group brands and questions by client, brand or campaign. Add questions in bulk and choose the engines and locations to check.</p></li>
        <li><h3>Collect on your schedule</h3><p>Run a batch once or schedule recurring checks. You can save questions and paused schedules before starting any paid provider work.</p></li>
        <li><h3>Inspect and share the evidence</h3><p>Open the answer behind a brand mention or cited source. Send a link to a teammate with access, or export run history.</p></li>
      </ol>
    </section>
    <PricingSection hosted={hosted} offers={offers} />
    <AlternativesComparison hosted={hosted} offers={offers} />
    <CostCalculator hosted={hosted} offers={offers} />
  </PublicLayout>;
}
