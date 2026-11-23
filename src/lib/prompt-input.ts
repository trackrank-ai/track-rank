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

export function parseQuestionFile(content: string, filename: string) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r\n|[\r\n]/).filter(line => line.trim());
  const isCsv = /\.csv$/i.test(filename);
  if (!isCsv && !/\.txt$/i.test(filename)) throw new Error("Choose a TXT or CSV file.");
  // Single-column CSV, one question per line. Require quoting for embedded commas.
  const questions = lines.map((line, index) => {
    if (!isCsv) return line.trim();
    const cell = line.trim();
    if (/^"(?:[^"]|"")*"$/.test(cell)) return cell.slice(1, -1).replaceAll('""', '"').trim();
    if (/[",]/.test(cell)) throw new Error(`CSV row ${index + 1} must contain one question. Quote questions containing commas.`);
    return cell;
  });
  if (isCsv && /^(?:question|prompt)$/i.test(questions[0] ?? "")) questions.shift();
  if (!questions.length) throw new Error("The file contains no questions.");
  if (questions.length > MAX_PROMPT_COMBINATIONS) throw new Error("Import up to 500 questions per file.");
  if (questions.some(q => q.length < 3 || q.length > 700)) throw new Error("Each question must contain 3–700 characters.");
  return questions;
}
