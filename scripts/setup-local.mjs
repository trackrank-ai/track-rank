import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function prepareLocalVars(path, template) {
  const existed = existsSync(path);
  let content = existed ? readFileSync(path, 'utf8') : template;
  const base = content.match(/^BASE_URL\s*=\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
  const url = new URL(base || '');
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Local setup requires an HTTP loopback BASE_URL in .dev.vars. No files were changed.');
  }
  for (const [key, placeholder] of [
    ['AUTH_SECRET', 'REPLACE_WITH_RANDOM_SECRET_AT_LEAST_32_CHARACTERS'],
    ['CREDENTIALS_KEY', 'REPLACE_WITH_BASE64_ENCODED_32_RANDOM_BYTES'],
  ]) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const current = content.match(regex)?.[0];
    if (!current || current.includes(placeholder) || /^\w+=["']?["']?$/.test(current)) {
      const line = `${key}="${randomBytes(32).toString('base64')}"`;
      content = current ? content.replace(regex, () => line) : content + '\n' + line + '\n';
    }
  }
  if (!existed || content !== readFileSync(path, 'utf8')) writeFileSync(path, content, { mode: 0o600 });
  return { existed, base };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const result = prepareLocalVars(resolve(root, '.dev.vars'), readFileSync(resolve(root, '.dev.vars.example'), 'utf8'));
    console.log(result.existed ? 'Existing local configuration preserved; missing placeholder secrets initialized.' : 'Created private local configuration with random secrets.');
    execFileSync(process.execPath, [resolve(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply', 'DB', '--local', '--config', 'wrangler.local.jsonc'], { cwd: root, stdio: 'inherit' });
    console.log(`Local setup ready. Start npm run dev and open ${result.base}. If you changed the port, pass -- --port <port>. No cloud credentials are required.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
