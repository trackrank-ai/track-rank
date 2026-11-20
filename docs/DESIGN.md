# TrackRank design system

## Foundation

Use shadcn/ui (New York / neutral, CSS-variable theming) and Tailwind CSS v4. Components are owned source in `src/components/ui`, added from the official registry using `npx shadcn@latest add <component>`. Configuration lives in `components.json`. Prefer these components over one-off primitives; use `cn` for class composition.

## Brand

- Warm-white canvas `#faf9f6`, charcoal ink `#20201f`, signal-orange mark `#ef5c2a`.
- Primary interactive orange `#b93b13` is darker for legible white button text. Decorative orange is not the text/button token.
- Geist Variable, self-hosted via Fontsource. Tight headline tracking, generous whitespace, restrained small labels.
- Ascending three-bar mark, shared visual language for wordmark and favicon. No bitmap logo dependency.
- Quiet borders, modest corners, sparse shadows. Dark olive-charcoal ownership panel contrasts the light product UI.
- Icons: Lucide. No simulated provider logos or implied provider integrations.

## Product honesty and interaction

The homepage is a concept preview. Label metrics, trends, sources and prompts as illustrative. Tabs work using the shadcn/Radix component. Sidebar labels are noninteractive preview decoration, not dead navigation buttons. No fake signup, auth, tracking execution, testimonials, customer logos or performance claims.

## Responsive and accessible

Stack landing sections on small screens, hide nonfunctional preview sidebar, retain all preview data tabs. Respect reduced motion; give focusable controls clear focus rings. Retain visible preview availability and illustrative-data labels at every viewport.
