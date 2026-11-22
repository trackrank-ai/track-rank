# TrackRank UX plan from the Promptwatch walkthrough

## Shipped on November 22, 2026

The signed-in desktop walkthrough covered 11 primary areas and 60 destinations in Promptwatch. TrackRank shipped the resulting redesign in [PR #24](https://github.com/trackrank-ai/track-rank/pull/24), merged as `0062993` and deployed without a database migration.

- **Prompts** opens on the question library. Each question has shareable Answers and Engine settings views. Returning from a citation restores the question, workspace and library filters. Bulk creation, collection and scheduling remain available.
- **Overview** links mention and citation rates to the contributing runs. A two-brand comparison uses only eligible answers that tracked both brands at collection time. The UI distinguishes zero matches from an empty cohort.
- **Sources & research** groups domains, pages and grounding queries. A drill-down distinguishes the full matching count from loaded rows and preserves the scope through run detail and CSV export.
- **Settings** gives Providers, Team & access, and Billing separate organization-scoped destinations. Billing links survive sign-in and remain available while workspace access is paused.

Signed-in production checks covered the library, question details, engine settings, Research, all three Settings destinations, and both empty and populated Overview states. Local desktop and mobile checks verified navigation and filter restoration. Local REST, MCP and CSV checks reconciled question, metric and source counts. The suite passed 113 tests with one skipped. Build, typecheck and both CI checks passed.

**Future scope.** Sentiment, share of voice, position, estimated volume and prompt difficulty remain research ideas. Define the data source, counting unit and denominator before introducing any of them. The observations and original acceptance criteria follow.

## Design direction

Make it easy for an analyst to start with a client question, see how often a brand appeared, and open the answers behind that number. TrackRank already records the question, engine, brand snapshot, answer and citations. The first release should shorten the path between them. Keep the current type, color and control system while changing what appears together on the screen.

## What the reference does well

| Promptwatch surface | Observed interaction or layout | TrackRank implication |
| --- | --- | --- |
| Home | The selected project and period sit above report views for visibility, position, sentiment and share of voice. A model-by-brand comparison offers another reading of the same subject. | Keep the workspace and reporting period visible as users move from a chart to evidence. Start with the two rates TrackRank can explain today. |
| Prompts | One workspace contains Prompts and Responses views. The question table places average visibility next to the question. Type, volume, difficulty, sentiment, mentions, topics, tags and creation date compete for the remaining width. Monitors, Models, Types and date are filters. | Put the question and its observed outcome together. Use the detail view for engine configuration, evidence and secondary attributes. |
| Sources | A time view and a top-domains view sit above URL-level reporting. The table distinguishes source, model, citation count, share and position. | Let users change granularity between domains and pages, retain report scope, and open the underlying answers. Explain how repeated links in one answer count. |
| Agent Chat and Prompt Explorer | Chat offers concrete starter questions. Discovery offers several entry points and names the integration needed for one of them. | Use concrete tasks in empty states. Existing prompts, provider setup and first collection deserve distinct next actions. |
| Actions, Content, Analytics and Site | Actions offers board and list views. Content has a distinct authoring area. Analytics separates crawler traffic from answer monitoring. Site lists crawled, queued, failed and unindexed pages and gives sitemap setup as its next action. | Borrow the separation between setup, operations and analysis. Keep TrackRank focused on its own collection evidence. |
| Brand and Settings | Brand Book groups descriptive brand attributes and aliases. The global Settings entry opens into a settings area with a second level of navigation. | Keep tracked brands in workspace context and identify organization-wide controls at their point of use. |

## Implementation order

### 1. Make the prompt library the starting point for research

Lead the populated Prompts screen with the question library, a Create prompts action, workspace scope and a compact filter row. Show each question once. Give its row the tracked engines, latest completed check and a link to answers. For multiple tracked brands, label the selected brand before displaying its mention rate. Introduce a question detail URL with **Answers** and **Engine settings**. Put bulk paste, preview and save in the creation flow. Preserve selection, batch Run and Schedule, save receipts, immutable wording and editable variants.

Acceptance: From a workspace with two questions on two engines, an analyst can open the answers to one question, identify the engine and brand, inspect an answer's citations, and use Back to restore the filtered library. A question without a collection shows its next action. On a phone the question and evidence action remain visible without horizontal page scrolling.

### 2. Connect Overview metrics to contributing evidence

Place the selected brand, workspace, period and engine beside the results. Give mention rate and citation rate a numerator, denominator, definition and link to matching runs. Label an empty eligible cohort distinctly from a measured zero. Use one trend surface with a metric switch. Keep collection failures and missing AI Overviews visible as coverage context. Add competitor trend comparison only once the team can use a common set of answers that actually tracked both brands.

Acceptance: For a known fixture containing a failed run, an organic-only result, eligible answers, and a competitor added halfway through, the counts and evidence links reconcile across Overview, REST, MCP and export for the same filters. The detail view can return to the same brand, metric and period.

### 3. Give sources a consistent drill-down and Settings an explicit scope

Group domain, page and grounding-query research under one Sources or Research destination. Carry the current scope from the ranked table to matching answers. Show server totals separately from the number of loaded rows. In Settings, give providers, team/access and billing distinct deep links, make the owning organization visible, and preserve billing access when workspace access is paused. Keep workspace brand aliases and question-level engine settings near their records.

Acceptance: Filtering a domain to one workspace and engine produces the same answer count in the table, drill-down and export. A viewer can discover the required role for restricted settings. A billing delegate can reach billing from a direct link on mobile.

### 4. Validate the flows before expanding the metric catalog

Prototype the populated question library and question detail first. Walk through finding a weak question, explaining a mention rate to a client, and locating a provider credential from an empty workspace. Check desktop, phone, keyboard, enlarged text, slow loading and empty results. Verify shareable URLs, scoped API/MCP reads and unchanged collection cost confirmation before release.

Sentiment, position, share of voice, estimated volume, prompt difficulty and crawler traffic would each require a defined data source and measurement method. Keep those out of the first release. A metric name alone does not establish its denominator or how a vendor calculates it.

## Walkthrough evidence and limits

The signed-in desktop walkthrough covered 60 navigation destinations across the 11 primary areas and their project and organization subpages. I also opened the custom prompt form, switched the library to Responses, opened a recorded response, and switched the dashboard comparison between visibility, sentiment, position and share of voice. Some screens showed setup, empty or upgrade states. Those observations describe the available interface. Paid workflows, onboarding from a new account, mobile behavior and proprietary score calculations remain unverified.

- **Screen layout.** On the desktop Prompts page, a narrow icon rail identifies the product area, an adjacent text sidebar lists related pages, and the main region starts with a title aligned to the filter and creation controls. The Prompts/Responses switch sits immediately below. Two summary bars precede the table. Blue draws attention to Create Prompts, while the question rows use borders and compact status marks. At this width several long questions truncate. For TrackRank, use a text-labeled section switch and give the question more space before adding summary panels or a second sidebar.
- **Question to evidence.** Create Prompts offers custom entry, batch upload, two generation paths and discovery. Custom entry asks for a monitor and supports adding another prompt. Responses switches the table to response excerpt, model, sentiment, brand mentions, enrichments, citations and date. A response opens a detail dialog with the original user prompt and formatted answer. Preserve this proximity in TrackRank with a shareable detail page. The library showed All time while Responses opened on Last 7 days, a reason to make an inherited or changed period explicit.
- **Metrics and groupings.** Trends separates gaining and losing prompts across time windows. Topics groups visibility, citation share, position, share of voice, sentiment and prompt/response counts. Query Fanouts switches between individual fanouts and a by-prompt view. Citation Trends surfaces first cited and peak citation alongside change over time. TrackRank's saved prompt sets and recorded grounding queries are natural starting points for similar groupings. Each grouping needs a defined counting unit.
- **Settings ownership.** Brand has aliases, competitor suggestions and ignored brands. Project settings include site and integration configuration and project API keys. Organization settings expose billing, team, project access, audit log and organization API keys. TrackRank's actual credential boundary is the organization. Label it explicitly even when a user reaches setup from a workspace.
- **Implementation anchors.** The TrackRank source review traced the library through src/routes/app.tsx and src/server/prompt-library.ts, reports through src/components/overview.tsx and src/server/analytics.ts, and evidence through src/components/research-drilldown.tsx and src/server/run-history.ts. Reuse the validated server scopes and existing reporting APIs wherever possible. Extend REST, MCP and docs/API.md together for new reads.
