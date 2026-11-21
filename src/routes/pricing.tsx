import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalLayout, ContactLink } from "@/components/legal-layout";
import { formatBillingPrice } from "@/lib/billing-price";
import { getPricingCatalog } from "@/server/site-config";

export const Route = createFileRoute("/pricing")({
  loader: () => getPricingCatalog(),
  head: () => ({ meta: [
    { title: "Pricing — TrackRank" },
    { name: "description", content: "TrackRank hosted plans and the 14-day no-card trial." },
  ] }),
  component: Pricing,
});

function Pricing() {
  const { hosted, offers } = Route.useLoaderData();
  return <LegalLayout title="Pricing" intro={hosted ? "Hosted plans are billed per organization. Self-hosting is free." : "This installation is self-hosted and requires no TrackRank subscription."}>
    {hosted && <section>
      <h2>Try TrackRank free for 14 days</h2>
      <p>Eligible verified accounts receive one trial without a payment card. At the end of your trial, an organization owner can subscribe. The trial ends without a charge.</p>
      <a className="button" href="/login?trial=start">Start 14-day free trial</a>
    </section>}
    {offers.map(offer => <section key={offer.offer_key}>
      <h2>{offer.name} · {formatBillingPrice(offer)}</h2>
      <p>Before applicable tax.</p>
      <ul>
        <li>{offer.limits.runs_per_month.toLocaleString("en-US")} tracking runs per calendar month</li>
        <li>{offer.limits.api_per_minute} API operations and {offer.limits.provider_per_minute} Standard/Priority batch requests per minute and {offer.limits.provider_per_minute} Live requests per minute</li>
      </ul>
    </section>)}
    {offers.length > 0 && <p>Limits are shared across your organization. The run allowance resets at midnight UTC on the first day of each month.</p>}
    <section><h2>Provider usage</h2><p>DataForSEO and optional OpenRouter usage are billed separately by those providers. Run allowances do not cap provider spending.</p></section>
    {hosted && <section>
      <h2>Cancellation, invoices and support</h2>
      <p>Organization owners can update their payment method, view invoices, and cancel at the end of the paid period in Manage billing. Request a full refund within 7 days of your first paid charge.</p>
      <p>Read the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>. Billing or refund questions can go to <ContactLink subject="Billing / refund" />.</p>
    </section>}
  </LegalLayout>;
}
