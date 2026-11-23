export const promptLibrarySorts = {
  monitoring: "Schedule status",
  newest: "Newest added",
  last_checked: "Most recently checked",
  never_checked: "Never checked first",
  answers: "Most eligible answers",
  mentions: "Most mentions",
  citations: "Most citations",
  lowest_mention_rate: "Lowest mention rate",
} as const;

export type PromptLibrarySort = keyof typeof promptLibrarySorts;
export const promptLibrarySortKeys = Object.keys(promptLibrarySorts) as [PromptLibrarySort, ...PromptLibrarySort[]];

export const brandPromptSorts: readonly PromptLibrarySort[] = ["mentions", "citations", "lowest_mention_rate"];
export const performancePromptSorts: readonly PromptLibrarySort[] = ["answers", ...brandPromptSorts];
