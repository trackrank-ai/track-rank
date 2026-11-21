export const MAX_PROMPT_TAGS = 20;
export const MAX_PROMPT_TAG_LENGTH = 50;

export function normalizePromptTag(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

export function validPromptTag(value: string) {
  return value.length > 0 && value.length <= MAX_PROMPT_TAG_LENGTH && !/[,\p{Cc}]/u.test(value);
}

export function splitPromptTags(value: FormDataEntryValue | null) {
  return String(value ?? "").split(",").map(normalizePromptTag).filter(Boolean);
}
