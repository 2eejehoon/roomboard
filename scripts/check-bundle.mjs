#!/usr/bin/env node
// T050: the production client bundle must not contain the E2E test hook (constitution IV).
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
console.log(`check-bundle: ok (${files.length} files in ${dir})`);
