#!/usr/bin/env node
// T014: one room for local dev and E2E (US1 without US3). Usage: npm run seed:dev
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRoomData } from '../src/core/room-data.ts';
import { THEME_IDS } from '../src/core/themes.ts';

// Stored format from research R5; src/worker/password.ts (T062) verifies the same string.
const hash = (password: string) => {
  const salt = randomBytes(16);
  return `pbkdf2-sha256$100000$${salt.toString('base64')}$${pbkdf2Sync(password, salt, 100_000, 32, 'sha256').toString('base64')}`;
};
const q = (v: string | number) => (typeof v === 'number' ? String(v) : `'${v.replaceAll("'", "''")}'`);

export function seedSql(now: number): string {
  const themeId = THEME_IDS[0];
  const row = {
    id: 'seedroom01',
    title: '시드 방',
    description: '개발·E2E용 방',
    room_data: JSON.stringify(createRoomData(themeId)),
    theme_id: themeId,
    password_hash: hash('seed-pass'),
    created_at: now,
    updated_at: now,
  };
  return `INSERT OR REPLACE INTO rooms (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(q).join(', ')});`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const d1 = (...args: string[]) => execFileSync('npx', ['wrangler', 'd1', ...args, 'roomboard', '--local'], { stdio: 'inherit' });
  d1('migrations', 'apply');
  d1('execute', '--command', seedSql(Date.now()));
}
