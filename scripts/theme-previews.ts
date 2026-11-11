#!/usr/bin/env node
// T067: theme card images for S2 (public/assets/previews/<themeId>.jpg), shot from our own 3D rooms.
// Usage: with `npm run dev` running on :5173, node scripts/theme-previews.ts. Its rooms are deleted again afterwards. Renders differ by machine, so the images are not in
// scripts/assets.sha256; rerun this after a theme or its assets change.
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { createRoomData } from '../src/core/room-data.ts';
import { THEME_IDS } from '../src/core/themes.ts';

const id = (themeId: string) => `preview${themeId.slice(0, 3)}`; // 10 characters, a valid room id
const rows = THEME_IDS.map((themeId) => {
  const v = [id(themeId), themeId, JSON.stringify(createRoomData(themeId)), themeId, 'x', 0, 0].map((x) => (typeof x === 'number' ? x : `'${x.replaceAll("'", "''")}'`));
  return `INSERT OR REPLACE INTO rooms (id, title, room_data, theme_id, password_hash, created_at, updated_at) VALUES (${v.join(', ')});`;
});
execFileSync('npx', ['wrangler', 'd1', 'execute', 'roomboard', '--local', '--command', rows.join('\n')], { stdio: 'inherit' });

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const themeId of THEME_IDS) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const failed: string[] = [];
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
  await page.goto(`http://localhost:5173/rooms/${id(themeId)}`);
  await page.locator('canvas').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(8000); // models and shadows settle; there is no "scene ready" signal
  if (failed.length || (await page.getByRole('alert').count())) throw new Error(`${themeId}: 3D did not load cleanly\n${failed.join('\n')}`);
  await page.addStyleTag({ content: 'body *:not(canvas):not(:has(canvas)) { visibility: hidden !important; }' }); // the room only
  await page.screenshot({ path: `public/assets/previews/${themeId}.jpg`, type: 'jpeg', quality: 70 });
  await page.close();
}
await browser.close();
const ids = THEME_IDS.map((themeId) => `'${id(themeId)}'`).join(', ');
execFileSync('npx', ['wrangler', 'd1', 'execute', 'roomboard', '--local', '--command', `DELETE FROM rooms WHERE id IN (${ids});`], { stdio: 'inherit' });
