import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { fingerprint, type Frame } from '../../src/core/fingerprint.ts';
import { app } from '../../src/worker/index.ts';

// T032: POST /api/bug-reports and server error recording (contracts/openapi.yaml, data-model.md bug_fingerprints, research R4·R5).
const VERSION = '202611130000-1a2b3c4';
// Module names of 23+ chars make chunk names the long-token pattern masks (PR #61 review).
const LONG = ['RoomConnectionStatusPanel-BXjaK0XS.js', 'RoomConnectionStatusBanner-8f1cAb12.js'];
const CHUNKS = ['index-BXjaK0XS.js', 'room3d-8f1cAb12.js', ...LONG];
const assets = (manifest?: unknown) =>
  ({
    fetch: async (input: RequestInfo | URL) =>
      new URL(new Request(input).url).pathname === '/manifest.json' && manifest
        ? Response.json(manifest)
        : new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }), // SPA fallback, as before PR (b)
  }) as unknown as Fetcher;
const deployed = { ...env, ASSETS: assets({ version: VERSION, chunks: CHUNKS }) };

const frames = (file = 'https://roomboard.example/assets/room3d-8f1cAb12.js'): Frame[] => [
  { file, fn: 'applyPeerMoved', line: 1, col: 20431 },
  { file: 'https://roomboard.example/assets/index-BXjaK0XS.js', fn: 'onMessage', line: 1, col: 300 },
];
const report = (errorName: string, extra: Record<string, unknown> = {}) => ({
  errorName,
  message: "Cannot read properties of undefined (reading 'p')",
  frames: frames(),
  appVersion: VERSION,
  view: '3d',
  browser: 'chrome',
  ...extra,
});
let ipSeq = 0;
const nextIp = () => `2001:db8::${(++ipSeq).toString(16)}`; // a fresh limiter key per request
const post = (body: unknown, e: Env = deployed, ip = nextIp()) =>
  app.request(
    '/api/bug-reports',
    { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) },
    e,
  );

const sha256 = (text: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
const fileNames = (fs: Frame[]) => fs.map((f) => ({ ...f, file: f.file.split('/').pop()! }));
const row = async (errorName: string) =>
  env.DB.prepare('SELECT * FROM bug_fingerprints WHERE fingerprint = ?').bind(await fingerprint(errorName, fileNames(frames()), sha256)).first<Record<string, unknown>>();
const rowCount = () => env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(count), 0) AS total FROM bug_fingerprints').first<{ n: number; total: number }>();
const today = () => new Date().toISOString().slice(0, 10);
const received = () => env.DB.prepare('SELECT reports_received FROM github_sync_state WHERE day = ?').bind(today()).first<number>('reports_received');

// A D1 binding whose prepare() throws for the SQL that matches `fails`; everything else goes to the real database.
const failingDb = (fails: RegExp, message = 'D1 down') =>
  new Proxy(env.DB, {
    get(target, key) {
      if (key === 'prepare')
        return (sql: string) => {
          if (fails.test(sql)) throw new Error(message);
          return target.prepare(sql);
        };
      const value = Reflect.get(target, key) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

describe('POST /api/bug-reports', () => {
  it('stores one fingerprint per error with the count, version range and view/browser distributions', async () => {
    expect((await post(report('CountError'))).status).toBe(202);
    expect((await post(report('CountError', { appVersion: '202611120000-aaaaaaa' }))).status).toBe(202);
    expect((await post(report('CountError', { view: '2d', browser: 'safari' }))).status).toBe(202);
    const r = (await row('CountError'))!;
    expect(r).toMatchObject({
      source: 'client',
      error_name: 'CountError',
      summary: "Cannot read properties of undefined (reading [가림])",
      count: 3,
      synced_count: 0,
      status: 'new',
      issue_number: null,
      fixed_version: null,
      app_version_min: '202611120000-aaaaaaa',
      app_version_max: VERSION,
    });
    expect(JSON.parse(r.frames as string)).toEqual(fileNames(frames()));
    expect(JSON.parse(r.view_counts as string)).toEqual({ '3d': 2, '2d': 1 });
    expect(JSON.parse(r.browser_counts as string)).toEqual({ chrome: 2, safari: 1 });
    expect(r.first_seen as number).toBeLessThanOrEqual(r.last_seen as number);
  });

  it('does not trust the client: redacts again, then cuts to 100/300/100, and keeps only the file name of a frame', async () => {
    const body = report('LeakError', {
      message: `mail a.b@example.com ${'y'.repeat(400)}`,
      frames: [{ file: 'https://user:pw@roomboard.example/assets/me/room3d-8f1cAb12.js?token=abc#x', fn: 'applyPeerMoved', line: 1, col: 20431 }, frames()[1]],
    });
    expect((await post(body)).status).toBe(202);
    const r = (await row('LeakError'))!;
    expect(r.summary).toBe(`mail [가림] ${'y'.repeat(300 - 'mail [가림] '.length)}`);
    expect(JSON.parse(r.frames as string)[0].file).toBe('room3d-8f1cAb12.js');

    // Each "::" (2 chars) becomes "[가림]" (4), so a 99-char name grows past 100 and must be cut after redact.
    const grows = ':: '.repeat(33);
    const named = report(grows, { frames: [{ ...frames()[0], fn: grows }] });
    expect((await post(named)).status).toBe(202);
    const stored = await env.DB.prepare("SELECT error_name, frames FROM bug_fingerprints WHERE error_name LIKE '[가림] [가림]%'").first<{ error_name: string; frames: string }>();
    expect(stored!.error_name).toBe('[가림] '.repeat(33).slice(0, 100));
    expect(JSON.parse(stored!.frames)[0].fn).toBe('[가림] '.repeat(33).slice(0, 100));
  });

  it('keeps a chunk name of the deployed build as is, even one the long-token pattern would mask; names outside the build are masked', async () => {
    const at = (file: string) => [{ ...frames()[0], file: `https://roomboard.example/assets/${file}` }];
    for (const file of LONG) await post(report('LongChunkError', { frames: at(file) }));
    await post(report('LongChunkError', { frames: at('RoomConnectionStatusForged-8f1cAb12.js') }));
    const stored = await env.DB.prepare("SELECT frames FROM bug_fingerprints WHERE error_name = 'LongChunkError'").all<{ frames: string }>();
    expect(stored.results.map((r) => JSON.parse(r.frames)[0].file).sort()).toEqual(['[가림].js', ...LONG].sort());
  });

  it('stores appVersion as unknown unless it is in the build format and not newer than the deployed build; dev sorts first', async () => {
    for (const appVersion of ['a.b@example.com', '209912312359-1a2b3c4', '20261113-1a2b3c4']) expect((await post(report('VersionError', { appVersion }))).status).toBe(202);
    expect(await row('VersionError')).toMatchObject({ count: 3, app_version_min: 'unknown', app_version_max: 'unknown' });
    await post(report('VersionError', { appVersion: VERSION }));
    await post(report('VersionError', { appVersion: 'dev' }));
    await post(report('VersionError', { appVersion: 'unknown' }));
    expect(await row('VersionError')).toMatchObject({ count: 6, app_version_min: 'dev', app_version_max: VERSION });
  });

  it('is gated from the third report when every app frame is a chunk of the deployed build (FR-015)', async () => {
    await post(report('GateError'));
    await post(report('GateError'));
    expect(await row('GateError')).toMatchObject({ count: 2, gated: 0 });
    await post(report('GateError'));
    expect(await row('GateError')).toMatchObject({ count: 3, gated: 1 });
  });

  it('is not gated when a frame is not a chunk of the deployed build (forged or old build), or when there is no manifest', async () => {
    const old = report('ForgedError', { frames: frames('https://roomboard.example/assets/room3d-ZZZZZZZZ.js') });
    for (let i = 0; i < 3; i++) await post(old);
    expect(await row('ForgedError')).toMatchObject({ count: 3, gated: 0 });

    for (let i = 0; i < 3; i++) await post(report('NoManifestError'), { ...env, ASSETS: assets() });
    expect(await row('NoManifestError')).toMatchObject({ count: 3, gated: 0, app_version_min: 'unknown', app_version_max: 'unknown' });
  });

  it('answers 202 to a body it does not store (bad JSON, wrong shape, unknown view, too many frames)', async () => {
    const before = await rowCount();
    for (const body of ['{', '[]', report('ShapeError', { view: 'vr' }), report('ShapeError', { frames: Array(21).fill(frames()[0]) }), { errorName: 'ShapeError' }])
      expect((await post(body)).status).toBe(202);
    expect(await rowCount()).toEqual(before);
  });

  it('drops the 11th report from one IP within 60 s and still answers 202 (FR-003)', async () => {
    const ip = '192.0.2.7';
    for (let n = 1; n <= 11; n++) expect((await post(report('IpError'), deployed, ip)).status).toBe(202);
    expect(await row('IpError')).toMatchObject({ count: 10 });
  });

  it('413 over 4KB', async () => {
    const res = await post(report('BigError', { message: 'x'.repeat(4096) }));
    expect(res.status).toBe(413);
    expect(await row('BigError')).toBeNull();
  });

  it('counts the day and, at 1000 reports, answers 202 and stores nothing (FR-003)', async () => {
    await post(report('DayError'));
    const n = (await received())!;
    await post(report('DayError'));
    expect(await received()).toBe(n + 1);

    await env.DB.prepare('UPDATE github_sync_state SET reports_received = 1000 WHERE day = ?').bind(today()).run();
    try {
      expect((await post(report('DayError'))).status).toBe(202);
      expect((await post(report('OverError'))).status).toBe(202);
      expect(await row('DayError')).toMatchObject({ count: 2 });
      expect(await row('OverError')).toBeNull();
      expect(await received()).toBe(1000);
    } finally {
      await env.DB.prepare('UPDATE github_sync_state SET reports_received = 0 WHERE day = ?').bind(today()).run();
    }
  });

  it('a failure while storing still answers 202 and is not recorded as a server error (spec Edge Cases)', async () => {
    const before = await rowCount();
    const ctx = createExecutionContext();
    const res = await app.request('/api/bug-reports', { method: 'POST', body: JSON.stringify(report('StoreError')) }, { ...deployed, DB: failingDb(/./) }, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(202);
    expect(await rowCount()).toEqual(before);
  });
});

describe('server errors', () => {
  const serverRows = () => env.DB.prepare("SELECT * FROM bug_fingerprints WHERE source = 'server'").all<Record<string, unknown>>().then((r) => r.results);

  it('a 500 stores a server fingerprint at once, gated, with the message redacted and the deployed version', async () => {
    const ctx = createExecutionContext();
    const e = { ...deployed, DB: failingDb(/FROM rooms/, 'D1 down for "비밀 방 제목" a.b@example.com') };
    const res = await app.request('/api/rooms', {}, e, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ code: 'internal' });
    const [r] = await serverRows();
    expect(r).toMatchObject({ error_name: 'Error', summary: 'D1 down for [가림] [가림]', count: 1, gated: 1, status: 'new', app_version_min: VERSION, app_version_max: VERSION });
    expect(JSON.parse(r!.view_counts as string)).toEqual({});
    const stored = JSON.parse(r!.frames as string) as Frame[];
    expect(stored.length).toBeGreaterThan(0);
    for (const f of stored) expect(f.file).not.toMatch(/[/?#]/);
  });

  it('when storing the server error fails too, the 500 is unchanged', async () => {
    const before = await rowCount();
    const ctx = createExecutionContext();
    const res = await app.request('/api/rooms', {}, { ...deployed, DB: failingDb(/./) }, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ code: 'internal' });
    expect(await rowCount()).toEqual(before);
  });

  it('a 500 without an execution context (app.request in other tests) still answers', async () => {
    const res = await app.request('/api/rooms', {}, { ...deployed, DB: failingDb(/FROM rooms/) });
    expect(res.status).toBe(500);
  });
});
