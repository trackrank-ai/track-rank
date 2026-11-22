export const MAX_PROMPT_COMBINATIONS = 500;

export function inspectPromptInput(input: string, separator = 'lines') {
  const lines = separator !== 'commas';
  let parts: string[] = [];
  if (lines) parts = input.split(/\r?\n|\r/);
  else {
    let current = '', quoted = false;
    for (let i=0;i<input.length;i++) {
      const c=input[i];
      if(c==='"' && (quoted || !current.trim())) {
        if(quoted && input[i+1]==='"'){current+='"';i++;}else quoted=!quoted;
      } else if(c===',' && !quoted){parts.push(current);current='';}else current+=c;
    }
    if (quoted) return { prompts: [], repeated: 0, error: 'Close the quoted prompt, or select One per line to keep punctuation unchanged.' };
    parts.push(current);
  }
  const nonblank = parts.map(part => part.trim()).filter(Boolean);
  const prompts = [...new Set(nonblank)];
  const error = prompts.some(p => p.length < 3 || p.length > 700)
    ? 'Each prompt must contain 3–700 characters.'
    : '';
  return { prompts, repeated: nonblank.length - prompts.length, error };
}

export function parsePromptInput(input: string, separator = 'lines'): string[] {
  const { prompts, error } = inspectPromptInput(input, separator);
  if (error) throw new Error(error);
  return prompts;
}
