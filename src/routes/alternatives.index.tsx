import { createFileRoute } from "@tanstack/react-router";
import { ComparisonIndex } from "@/components/comparison-pages";
import { getPricingCatalog } from "@/server/site-config";
export const Route = createFileRoute("/alternatives/")({
  loader: () => getPricingCatalog(),
  head: ({ loaderData }) => ({ meta: [{ title: "AI visibility tool alternatives | TrackRank" }, { name: "description", content: "Compare AI visibility tool alternatives for open-source control, self-hosting, provider credentials and scalable monitoring with sourced costs and trade-offs." }], links: loaderData ? [{ rel: "canonical", href: `${loaderData.origin}/alternatives` }] : [] }),
  component: () => <ComparisonIndex alternatives={true} />,
});
