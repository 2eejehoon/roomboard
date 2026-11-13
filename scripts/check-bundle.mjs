#!/usr/bin/env node
// T050: the production client bundle must not contain the E2E test hook (constitution IV).
// 002 T036: it must hold the /manifest.json the Worker gates reports on; without it every report stays ungated (PR #63 review).
// Usage: node scripts/check-bundle.mjs [dir]   (default dist/client)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist/client';
const files = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((f) => f.isFile());
const hits = files.map((f) => join(f.parentPath, f.name)).filter((path) => readFileSync(path, 'latin1').includes('__roomboard'));
if (hits.length) {
  console.log(`check-bundle: __roomboard found in ${hits.join(', ')}. Keep the hook inside an import.meta.env.DEV branch (src/client/test-hooks.ts).`);
  process.exit(1);
}
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
} catch {}
// Same version format as src/worker/bug-reports.ts; vendor- chunks are what fingerprint() leaves out (vite.config.ts).
const usable = /^(\d{12}-[0-9a-f]{7,12}|dev)$/.test(manifest?.version) && manifest.chunks?.some((c) => c.startsWith('vendor-'));
if (!usable) {
  console.log(`check-bundle: ${dir}/manifest.json is missing or has no valid version or vendor- chunk. See the manifest plugin in vite.config.ts.`);
  process.exit(1);
}
console.log(`check-bundle: ok (${files.length} files in ${dir})`);
