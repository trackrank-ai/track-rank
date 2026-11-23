# TrackRank design system

The [November 2026 technical audit](design-audit-2026-11-22.md) records measured contrast, spacing and responsive behavior across the public site and authenticated app.

The [Promptwatch walkthrough and TrackRank release record](plans/promptwatch-ux-review.md) connects the reference screens to the shipped question library, evidence links, research navigation and organization settings.

## Foundation

Use shadcn/ui (New York / neutral, CSS-variable theming) and Tailwind CSS v4. Components are owned source in `src/components/ui`, added from the official registry using `npx shadcn@latest add <component>`. Configuration lives in `components.json`. Prefer these components over one-off primitives; use `cn` for class composition.

## Visual hierarchy and typography

The question is the heading of a run detail. Follow it with the workspace, engine, collection location, timestamp and status. Give the answer a readable column. Show brand observations from the run snapshot and the sources returned with that answer. Link a source to a specific passage only when the evidence supplies that association. Preserve the separate organic-results view when Google returns organic links without an AI Overview.

Use self-hosted Geist Variable. Start with 16 px for answer text, 14 px for controls and rows, and 12–13 px for metadata. Allow long questions, brand names and URLs to wrap. Keep the engine identifiable when a question label is shortened.

## Colors

Use the warm-white background, charcoal text and burnt-orange interactive accent in light mode. Dark mode follows the reader’s explicit choice. Keep normal text at a contrast ratio of at least 4.5:1 in both themes, including cost assumptions, inactive tabs and form hints.

Use the surface’s foreground tokens for text. In the app, use `--control-border` for editable controls. Public calculator fields use `--public-muted` for their border.

## Components

Use the shared buttons, cards and tabs. Label form controls directly, associate explanatory text with its control, and make help accessible by keyboard and touch. Keep focus visible and use text for collection status. Where the outline identifies an editable field, give its idle border at least 3:1 contrast against the adjacent surface in both themes. Give disclosure summaries and adjacent footer links a 44 px touch target on coarse pointers. Keep related numbers and labels together when layouts stack.

## Public product evidence

The landing page uses the same evidence presentation as an authenticated run. Label the example as illustrative at the point where the reader sees it. The question, engine, answer, brand observation and source should be legible before signup. Explain the separate provider account and collection charges alongside the hosted trial action. Use the installation’s actual hosting configuration when choosing calls to action.

## Responsive navigation and workspace overview

The compact app has a labeled section chooser and a separate workspace selector. Retain the current section and workspace after reload or sign-in. Make Product, Pricing and Compare directly accessible on the compact public site. At phone widths, keep all pricing comparison values accessible. Check Home and Pricing at 320 CSS px with text enlarged to 200%, using both the self-hosted state and the populated hosted catalog. Prices, plan limits, navigation and trial actions must fit without horizontal page scrolling.

For a workspace awaiting its first collection, put the next setup step ahead of analytics filters. Explain how brand assignment affects future snapshots and keep save-only actions available before credentials are connected. For a populated workspace, lead with a result and its scope. Distinguish an empty workspace from a search that returned no matches. Every schedule action must identify its engine variant and distinguish the workspace in organization-wide views.

## Form layout and disclosure

Use `form-stack` for related fields, `form-grid` for independent columns, `app-inline-form` for a field and its action, and `form-actions` for a group of buttons. Align the submit button with the input edge below its label. At narrow widths let fields take their own line and wrap related buttons together. Keep a consistent control height within a row and allow larger touch targets.

Keep the selection count, Run and Schedule visible together. Open **Manage selection** for moving, tagging or deleting the selected variants. Keep sampling and engine settings under Advanced. Show active report filters and schedule timing in their disclosure summaries.

Let expanded engine settings use the available row width, including on tablets. Leave `0.75rem` (12 px at default text size) between the editor and its Run and Delete actions. On narrow screens, let variant selection take its own line so the action buttons can stay together when space permits.

Keep numeric input as a draft while the user types. For samples, clearing the field and typing `5` must produce `5`. Use a valid whole number from 1 to 10 for projections and collection actions. While the draft is invalid, show the range beside the field and keep independent actions such as **Save questions** available. In bulk schedule edits, a blank sample field preserves each schedule’s current count.

## Bulk selection

Use the shared bulk selection control for lists with bulk actions. Show the selected count, support a mixed checkbox state, and let users clear the selection. Offer the full matching count only after the current page is selected and additional pages exist. Keep selections across page navigation. Expanding the selection reads matches in the active organization, workspace and filters. It never performs a bulk write.

## Shareable app navigation

Give each authenticated section and shareable record a stable URL. Use the existing app search parameters for organization, workspace, section, and record identity. Add to that contract when creating a new destination. Use real links for navigation and keep loading and permission errors in the destination view. A shared URL must survive refresh, browser history, and sign-in. The server still checks membership and resource ownership. Keep credentials, invitation tokens, and other secrets out of shareable app queries. Sources and matching answers retain the workspace, report filters and selected research group. Organization settings links address a section of the owning organization and work independently of the selected workspace.

## Pricing and active trials

Use `PricingSection` with `getPricingCatalog` on both public pricing surfaces; do not hardcode a second hosted tier catalog. Monthly volume and searchable history are the only tier differentiators. Keep custom plan contact and separate provider costs adjacent to pricing. Comparison claims need dated official sources, original currency and explicit non-equivalence. Never guarantee lower total cost.

Active hosted trials show a nondismissible sticky accent banner above the app topbar. Use authoritative billing status and expiry for the selected organization, round remaining days up, update the clock while open, and link to the existing authorized Settings billing flow. Do not show old organization trial state during an organization switch.

## Tracking sets

Use a named tracking set as the home for a collection of questions. The set name and workspace stay visible across Overview, Questions, Answers and Settings. Show active, paused and unscheduled engine variants separately, along with the last completed check and next scheduled check. A question can run on multiple engines with different schedules.

Ask whether the user wants to save questions, check once or track on a schedule before the review. Show timing for recurring checks. An immediate check alongside a new schedule requires its own opt-in. The review should state which new and existing variants will be affected, checks now, recurring checks and separate provider charges. Return to the same set after saving.

A reporting drill-down should explain what contributed to the displayed number. Keep the period, engine, set and comparison cohort when linking a question’s count to its answers. Distinguish a measured zero from a period without eligible answers. In an empty Schedules view, offer question selection first, then timing.

## Prompt creation and collection

Default to one question per line. Show the parsed wording, repeated-line count, and per-engine matches before saving. Lead with the saved question library and an **Add prompts** action. Offer the workspace library, an existing tracking set, or a new set as the destination. Questions and Answers share the same period, engine, and library filters. Show a saved question once with its tracked engines, last completed check, scoped answer and brand counts, and an **Answers** link. Keep questions without eligible answers visibly outside performance rankings. Give question details shareable **Answers** and **Engine settings** views. Retain library filters through the detail links and browser history. Saved wording is fixed. Keep engine settings available for individual variants and offer partial changes to execution mode, location and language for a selection. Make saved variants and recurring schedules distinct from one-time checks. Start with weekly timing and one sample, with timing changes and extra samples available on demand. Put schedule creation on Prompts and use Schedules to manage existing monitoring. A save receipt and a run batch each have a shareable organization/workspace URL. Run lists and CSV use the same URL-backed filters.

## Design review and release · November 22, 2026

The Impeccable review graded the pre-redesign public site **23/36** and the authenticated app **24/40**. The reviewers weighted agency analysts and in-house marketers equally. They found that the homepage gave its most prominent visual to an abstract chart, a new workspace showed six filters before its first useful action, and schedules for different engines could have identical visible and accessible names. The team used these findings to prioritize the following changes. A post-release design grade is still open.

| Surface | Decision carried into production |
| --- | --- |
| Run detail | Put the question and collection context first, with the recorded answer, brand observations and inspectable sources together. Preserve links to each evidence tab. |
| Homepage and Pricing | Reuse the evidence view for a labeled illustrative answer linked to Penpot documentation. Show the separate provider requirement alongside the trial action. Preserve the live catalog and editable cost assumptions. |
| Overview and navigation | Lead with setup while the workspace awaits collection, then with findings and their reporting scope. On phones, expose the current section and workspace independently. |
| Prompts, Schedules and Run History | Change question wording by deleting and recreating the prompt. Keep engine settings editable. Identify variants wherever people select a record to inspect, edit or delete. |

The redesign shipped to production from `main` at `ce82463` without a database migration. The implementation is recorded in [answer detail and shared controls](https://github.com/trackrank-ai/track-rank/pull/16), [authenticated workflows](https://github.com/trackrank-ai/track-rank/pull/17), and [public pages](https://github.com/trackrank-ai/track-rank/pull/18).

**Verification.** Live desktop and phone browsers exercised the homepage, example source link, pricing offers, calculator, navigation and dark mode. Authenticated checks used local fixtures to exercise REST, MCP, evidence links and schedule edits. Changing one Gemini schedule left the three other schedules in the two-question, two-engine batch untouched. Build and typecheck passed, with 108 tests passing and one skipped. Paid provider collection and checkout were outside this release check.
