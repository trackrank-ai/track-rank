# From monitoring questions to their evidence

## Implementation order

1. Group global navigation by task. Keep Overview first, then Monitoring (Prompts, Tracking sets, Schedules), Evidence (Sources, Run history), and Management. Use the same order in the phone section chooser. Keep the workspace independent of the destination.
2. Give Prompts one Add prompts entry, an optional destination set and a review before collection. Put Questions and Answers together. Order question rows around the question, scoped metrics, eligible answer count and latest check. Make unmeasured questions distinguishable from measured zero. Keep bulk actions contextual.
3. Lead a populated Overview with the brand, period, engine, mention and citation measurements. Switching the metric updates its trend and contributing questions. Preserve the scope to the answer and back. Explain zero denominators and provide an action with evidence when the wider collection has answers. Show setup first for a new workspace.
4. Make Sources a searchable, pageable ranking across the entire authorized cohort. Show distinct answer and question counts, share and last seen. Follow a domain to its pages, a page to its questions and answers, and a recorded citation back to internal research or out to the publisher. Use recorded evidence for every number.
5. Verify matching counts across REST, MCP, the list, and its drill-down. Check cursor boundaries, tenant access, empty periods, zero rates, mobile layouts and shareable URLs. Run the test suite, build, typecheck and browser journeys. Merge via CI and check production migrations before deploying the merged Worker. Verify authenticated production views without starting a collection.
