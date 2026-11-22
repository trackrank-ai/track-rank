import { createFileRoute, Link } from "@tanstack/react-router";
import { ContactLink } from "@/components/legal-layout";
import { PublicLayout } from "@/components/public-layout";
import { AlternativesComparison, CostCalculator, PricingSection } from "@/components/pricing-section";
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
  return <PublicLayout page="pricing">
    <PricingSection hosted={hosted} offers={offers} standalone />
    <AlternativesComparison hosted={hosted} offers={offers} />
    <CostCalculator hosted={hosted} offers={offers} />
    {hosted && (
      <section className="public-billing-support" aria-labelledby="billing-support-title">
        <h2 id="billing-support-title">Cancellation, invoices and support</h2>
        <p>Organization owners can update their payment method, view invoices, and cancel at the end of the paid period in Manage billing. Request a full refund within 7 days of your first paid charge.</p>
        <p>Read the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>. For billing or refund questions, email <ContactLink subject="Billing / refund" />.</p>
      </section>
    )}
  </PublicLayout>;
}
