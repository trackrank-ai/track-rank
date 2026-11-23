import { createFileRoute, notFound } from "@tanstack/react-router";
import { competitorBySlug } from "@/data/competitors";
import { getPricingCatalog } from "@/server/site-config";
import { AlternativesPage } from "@/components/comparison-pages";

export const Route = createFileRoute("/alternatives/$competitor")({
  loader: async ({ params }) => {
    const item = competitorBySlug(params.competitor);
    if (!item) throw notFound();
    return { item, catalog: await getPricingCatalog() };
  },
  head: ({ loaderData }) => loaderData ? ({
    meta: [{ title: `${loaderData.item.name} alternatives | Trackrank AI` }, { name: "description", content: loaderData.item.altDescription }],
    links: [{ rel: "canonical", href: `${loaderData.catalog.origin}/alternatives/${loaderData.item.slug}` }],
  }) : {},
  component: Page,
});
function Page() { const { item, catalog } = Route.useLoaderData(); return <AlternativesPage item={item} catalog={catalog} />; }
