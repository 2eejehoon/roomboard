import { pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { createRoomData } from '../../src/core/room-data.ts';
import { THEME_IDS } from '../../src/core/themes.ts';
import { seedSql } from '../../scripts/seed-dev.ts';

// T014: the seed room is a valid row of migrations/0001_init.sql with a hash of "seed-pass".
it('inserts seedroom01 with the first theme and a pbkdf2 hash of seed-pass, and can run twice', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'));
  db.exec(seedSql(1762400000000));
  db.exec(seedSql(1762400000001));
  const rows = db.prepare('SELECT * FROM rooms').all() as Record<string, unknown>[];
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row).toMatchObject({ id: 'seedroom01', theme_id: THEME_IDS[0], deleted_at: null, created_at: 1762400000001 });
  expect(JSON.parse(String(row.room_data))).toEqual(createRoomData(THEME_IDS[0]));
  const [scheme, iterations, salt, hash] = String(row.password_hash).split('$');
  expect(scheme).toBe('pbkdf2-sha256');
  expect(pbkdf2Sync('seed-pass', Buffer.from(salt, 'base64'), Number(iterations), 32, 'sha256').toString('base64')).toBe(hash);
  expect(Buffer.from(salt, 'base64')).toHaveLength(16);
});
