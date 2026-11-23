import { comparisonPaths } from "../data/competitors";
// Public pages only. Never enumerate authenticated workspace or evidence URLs.
export const publicPages = ["/", "/pricing", "/privacy", "/terms", "/support", "/security", ...comparisonPaths];

function xml(value: string) {
  return value.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

export function discoveryResponse(path: string, baseUrl: string): Response | null {
  const origin = new URL(baseUrl).origin;
  const headers = { "Cache-Control": "public, max-age=3600" };
  if (path === "/robots.txt") return new Response([
    "User-agent: *", "Allow: /", "", `Sitemap: ${origin}/sitemap.xml`, "",
  ].join("\n"), { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  // Private pages use X-Robots-Tag: noindex, not Disallow: crawlers must see it.
  if (path === "/sitemap.xml") return new Response(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    publicPages.map(page => `<url><loc>${xml(origin + page)}</loc></url>`).join("") + "</urlset>\n",
    { headers: { ...headers, "Content-Type": "application/xml; charset=utf-8" } },
  );
  return null;
}
