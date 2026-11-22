# TrackRank design system

## Foundation

Use shadcn/ui (New York / neutral, CSS-variable theming) and Tailwind CSS v4. Components are owned source in `src/components/ui`, added from the official registry using `npx shadcn@latest add <component>`. Configuration lives in `components.json`. Prefer these components over one-off primitives; use `cn` for class composition.

## Brand

- Default theme: warm-white canvas, charcoal ink and signal-orange accents. Dark mode is opt-in. Header/app/auth toggles persist an explicit preference locally; a pre-paint script applies only an explicit dark selection.
- Light mode retains the warm-white canvas `#faf9f6`, charcoal ink `#20201f`, signal-orange mark `#ef5c2a`.
- Primary interactive orange `#b93b13` is darker for legible white button text. Decorative orange is not the text/button token.
- Geist Variable, self-hosted via Fontsource. Tight headline tracking, generous whitespace, restrained small labels.
- Ascending three-bar mark, shared visual language for wordmark and favicon. No bitmap logo dependency.
- Quiet borders, modest corners, sparse shadows. Dark olive-charcoal ownership panel contrasts the light product UI.
- Icons: Lucide. Saved prompt rows use self-hosted engine marks from [Lobe Icons](https://github.com/lobehub/lobe-icons) with names available on hover and keyboard focus.

## Product honesty and interaction

The homepage describes the live open-source product and hosted service. The interactive dashboard is illustrative: label its metrics, trends, sources and prompts as sample data. Tabs work using the shadcn/Radix component. Sidebar labels are noninteractive preview decoration, not dead navigation buttons. No fake signup, auth, tracking execution, testimonials, customer logos or performance claims.

## Responsive and accessible

Stack landing sections on small screens, hide nonfunctional preview sidebar, retain all preview data tabs. Respect reduced motion; give focusable controls clear focus rings. Retain visible illustrative-data labels at every viewport.

## Bulk selection

Use the shared bulk selection control for lists with bulk actions. Show the selected count, support a mixed checkbox state, and let users clear the selection. Offer the full matching count only after the current page is selected and additional pages exist. Keep selections across page navigation. Expanding the selection reads matches in the active organization, workspace and filters. It never performs a bulk write.

## Shareable app navigation

Give each authenticated section and shareable record a stable URL. Use the existing app search parameters for organization, workspace, section, and record identity. Add to that contract when creating a new destination. Use real links for navigation and keep loading and permission errors in the destination view. A shared URL must survive refresh, browser history, and sign-in. The server still checks membership and resource ownership. Keep credentials, invitation tokens, and other secrets out of shareable app queries.

## Pricing and active trials

Use `PricingSection` with `getPricingCatalog` on both public pricing surfaces; do not hardcode a second hosted tier catalog. Monthly volume and searchable history are the only tier differentiators. Keep custom plan contact and separate provider costs adjacent to pricing. Comparison claims need dated official sources, original currency and explicit non-equivalence. Never guarantee lower total cost.

Active hosted trials show a nondismissible sticky accent banner above the app topbar. Use authoritative billing status and expiry for the selected organization, round remaining days up, update the clock while open, and link to the existing authorized Settings billing flow. Do not show old organization trial state during an organization switch.

## Prompt creation and collection

Default to one question per line. Show the parsed wording, repeated-line count, and per-engine matches before saving. Show a saved question once with its tracked engines, and offer a shared wording edit separately from engine settings. Make saved variants and recurring schedules distinct from one-time checks. Start with weekly timing and one sample, with timing changes and extra samples available on demand. Put schedule creation on Prompts and use Schedules to manage existing monitoring. A save receipt and a run batch each have a shareable organization/workspace URL. Run lists and CSV use the same URL-backed filters.
