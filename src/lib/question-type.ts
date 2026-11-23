export const questionTypes = ["discovery", "comparison", "branded"] as const;
export type QuestionType = typeof questionTypes[number];

export function questionTypeLabel(type: QuestionType) {
  return { discovery: "Discovery", comparison: "Comparison", branded: "Branded" }[type];
}
