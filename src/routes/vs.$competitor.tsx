import { createFileRoute, notFound } from "@tanstack/react-router";
import { competitorBySlug } from "@/data/competitors";
import { getPricingCatalog } from "@/server/site-config";
import { ComparisonPage } from "@/components/comparison-pages";

export const Route = createFileRoute("/vs/$competitor")({
  loader: async ({ params }) => {
    const item = competitorBySlug(params.competitor);
    if (!item) throw notFound();
    return { item, catalog: await getPricingCatalog() };
  },
  head: ({ loaderData }) => loaderData ? ({
    meta: [{ title: `Trackrank AI vs ${loaderData.item.name}: Open source` }, { name: "description", content: loaderData.item.description }],
    links: [{ rel: "canonical", href: `${loaderData.catalog.origin}/vs/${loaderData.item.slug}` }],
  }) : {},
  component: Page,
});
function Page() { const { item, catalog } = Route.useLoaderData(); return <ComparisonPage item={item} catalog={catalog} />; }
