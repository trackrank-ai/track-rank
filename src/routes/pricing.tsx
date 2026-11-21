import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalLayout, ContactLink } from "@/components/legal-layout";
import { PricingSection, CostCalculator, AlternativesComparison } from "@/components/pricing-section";
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
    <PricingSection hosted={hosted} offers={offers} />
    {hosted && <><AlternativesComparison offers={offers} /><CostCalculator offers={offers} /></>}
    {hosted && <section>
      <h2>Cancellation, invoices and support</h2>
      <p>Organization owners can update their payment method, view invoices, and cancel at the end of the paid period in Manage billing. Request a full refund within 7 days of your first paid charge.</p>
      <p>Read the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>. Billing or refund questions can go to <ContactLink subject="Billing / refund" />.</p>
    </section>}
  </LegalLayout>;
}
