export function parsePromptInput(input: string, separator = 'auto'): string[] {
  const lines = separator === 'lines' || (separator === 'auto' && /[\r\n]/.test(input));
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
    if(quoted)throw new Error('Close the quoted prompt, or select One per line to keep punctuation unchanged.');
    parts.push(current);
  }
  const prompts=[...new Set(parts.map(p=>p.trim()).filter(Boolean))];
  if(prompts.some(p=>p.length<3 || p.length>700))throw new Error('Each prompt must contain 3–700 characters.');
  if(prompts.length>100)throw new Error('Paste up to 100 prompts at a time.');
  return prompts;
}
