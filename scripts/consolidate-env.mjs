// One-time local configuration migration. Never prints configuration values.
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['.env', 'backend/.env', 'frontend/web/.env', 'frontend/web/.env.local'];
const existing = files.filter(file => existsSync(resolve(root, file)));
const values = {};
for (const file of existing) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(resolve(root, file), 'utf8')))) {
    if (value || !(key in values)) values[key] = value;
  }
}
const content = '# Shared local configuration for backend, frontend and contract tooling.\n'
  + '# Only NEXT_PUBLIC_* variables may be exposed in browser code.\n'
  + Object.entries(values).map(([key, value]) => {
    const quote = !value.includes('"') ? '"' : !value.includes("'") ? "'" : undefined;
    if (!quote) throw new Error(`Cannot safely serialize ${key}; no files were changed.`);
    return `${key}=${quote}${value}${quote}`;
  }).join('\n') + '\n';
const parsed = parseEnv(content);
if (Object.keys(values).some(key => parsed[key] !== values[key])) {
  throw new Error('Environment serialization changed a value; no files were changed.');
}
const backup = resolve(root, '.env-backups', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(backup, { recursive: true });
for (const file of existing) copyFileSync(resolve(root, file), resolve(backup, file.replaceAll('/', '__')));
writeFileSync(resolve(root, '.env'), content);
for (const file of existing.filter(file => file !== '.env')) unlinkSync(resolve(root, file));
console.log(`Consolidated ${existing.length} files into project-root .env. Original files preserved in .env-backups/.`);
