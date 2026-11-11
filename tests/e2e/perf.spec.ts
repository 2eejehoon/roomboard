import { expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import { connect } from 'node:net';
import { gzipSync } from 'node:zlib';
import { ko } from '../../src/client/i18n/ko.ts';
import { newPage, test } from './helpers.ts';

// T096, SC-001: a phone on ordinary 4G (Chrome DevTools' Fast 4G preset, precedent 2026-11-09-perf-4g) gets from the list
// into a room and moves within 10 s, and the room's first 3D assets (models, characters) stay at or under 5 MB (3 MB since 003 dropped the HDRI).
// The dev server sends about 39 MB of unbundled modules, so this runs against the production build (`npm run build`, as CI
// does before E2E) under `vite preview`. Preview does not compress, so a small proxy gzips text responses as Cloudflare does
// (uncompressed, the JS alone is about 3x larger and the run took 8~9 s).
const FAST_4G = { offline: false, downloadThroughput: (9_000_000 / 8) * 0.9, uploadThroughput: (1_500_000 / 8) * 0.9, latency: 60 * 2.75 };
const PREVIEW = 'http://localhost:4174';
const ASSETS_3D = /^\/assets\/(models|characters)\//;

// localhost:4174 → vite preview on 4173: text bodies gzipped, WebSocket upgrades piped through untouched.
function gzipProxy(): Server {
  const server = createServer((req, res) => {
    const headers = { ...req.headers, 'accept-encoding': 'identity' };
    const up = request({ host: 'localhost', port: 4173, path: req.url, method: req.method, headers }, (upRes) => {
      const chunks: Buffer[] = [];
      upRes.on('data', (c: Buffer) => chunks.push(c));
      upRes.on('end', () => {
        let body = Buffer.concat(chunks);
        const out = { ...upRes.headers };
        if (/text|javascript|json|svg/.test(out['content-type'] ?? '')) {
          body = gzipSync(body);
          out['content-encoding'] = 'gzip';
        }
        out['content-length'] = String(body.length);
        res.writeHead(upRes.statusCode ?? 502, out).end(body);
      });
    });
    up.on('error', () => res.writeHead(502).end()); // preview still starting
    req.pipe(up);
  });
  server.on('upgrade', (req, socket, head) => {
    const up = connect(4173, 'localhost', () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      up.write(`${lines.join('\r\n')}\r\n\r\n`);
      up.write(head);
      socket.pipe(up).pipe(socket);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });
  return server.listen(4174);
}

test.skip(({ isMobile }) => !isMobile, 'SC-001 is defined for phones; the mobile project runs it');

let preview: ChildProcess | undefined;
let proxy: Server | undefined;
test.beforeAll(async () => {
  if (!existsSync('dist/client/index.html')) throw new Error('perf.spec needs the production build: run npm run build first');
  preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore', detached: true });
  proxy = gzipProxy();
  await expect.poll(() => fetch(PREVIEW).then((r) => r.ok, () => false), { timeout: 30_000 }).toBe(true);
});
test.afterAll(() => {
  proxy?.close();
  if (preview?.pid) process.kill(-preview.pid);
});

test('SC-001: list → room → first move within 10 s on 4G; the first 3D assets ≤ 5 MB', async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await newPage(browser);
  await (await page.context().newCDPSession(page)).send('Network.emulateNetworkConditions', FAST_4G);
  let assetBytes = 0;
  page.on('requestfinished', async (req) => {
    if (ASSETS_3D.test(new URL(req.url()).pathname)) assetBytes += (await req.sizes()).responseBodySize;
  });
  const firstMove = new Promise<number>((resolve) =>
    page.on('websocket', (ws) => ws.on('framesent', (f) => typeof f.payload === 'string' && f.payload.includes('"t":"move"') && resolve(Date.now()))),
  );

  const started = Date.now();
  await page.goto(PREVIEW);
  await page.locator('main a[href^="/rooms/"]').first().click();
  const joystick = page.getByRole('group', { name: ko['room3d.joystick'] });
  // The joystick shows before the models and physics load; drag until a move goes out.
  let moved = false;
  const dragging = (async () => {
    while (!moved) {
      await expect(joystick).toBeVisible({ timeout: 10_000 });
      const box = (await joystick.boundingBox())!;
      const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y - 40, { steps: 5 });
      await page.waitForTimeout(300);
      await page.mouse.up();
    }
  })();
  const elapsed = (await firstMove) - started;
  moved = true;
  await dragging;
  await page.waitForLoadState('networkidle');
  console.log(`SC-001: first move after ${elapsed} ms; first 3D assets ${assetBytes} bytes`);
  expect(elapsed).toBeLessThanOrEqual(10_000);
  expect(assetBytes).toBeGreaterThan(0);
  // 003 research R1: without the HDRI (1.6~1.8 MB a theme) the first 3D assets fit well under 3 MB; the plan limit stays 5 MB.
  expect(assetBytes).toBeLessThanOrEqual(3 * 1024 * 1024);
});
