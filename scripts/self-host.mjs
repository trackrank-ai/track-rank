import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const action = process.argv[2];
if (!['build', 'deploy', 'migrate'].includes(action)) throw new Error('Expected build, deploy or migrate');
const path = 'wrangler.selfhost.json';
let config;
try { config = JSON.parse(readFileSync(path, 'utf8')); }
catch { throw new Error('Copy wrangler.selfhost.example.json to wrangler.selfhost.json and configure your own resources first.'); }
if (JSON.stringify(config).includes('REPLACE_WITH_')) throw new Error('Replace all self-hosting configuration placeholders first.');
const host = new URL(config.vars?.BASE_URL);
if (host.protocol !== 'https:' || host.hostname === 'trackrank.ai' || host.hostname.endsWith('.trackrank.ai')) throw new Error('Set your own HTTPS BASE_URL, not the hosted TrackRank domain.');
if (config.d1_databases?.some(db => db.database_id === '50b16780-7ff1-4e31-8000-d99d81e11122')) throw new Error('Use your own D1 database, not the hosted service database.');
const run = (tool, args, env = process.env) => execFileSync(process.execPath, [`node_modules/${tool}`, ...args], { stdio: 'inherit', env });
if (action === 'migrate') {
  run('wrangler/bin/wrangler.js', ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', path]);
} else {
  run('vite/bin/vite.js', ['build'], { ...process.env, TRACKRANK_CONFIG: path });
  if (action === 'deploy') {
    const generated = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
    if (generated.name !== config.name || generated.vars?.BASE_URL !== config.vars.BASE_URL) throw new Error('Generated deployment does not match self-host configuration.');
    run('wrangler/bin/wrangler.js', ['deploy', '--config', 'dist/server/wrangler.json']);
  }
}
