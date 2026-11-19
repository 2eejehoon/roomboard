// 002 T037 (research R4, precedent 2026-11-17-client-collector): client errors to POST /api/bug-reports. The Worker drops a report
// that misses the schema or 4KB without saying so, so this side redacts, cuts and fits before sending.
import type { z } from 'zod';
import type { clientErrorReport } from '../../core/api-schemas.ts';
import { fileName, fingerprint, parseStack } from '../../core/fingerprint.ts';
import { RateBucket } from '../../core/rate-bucket.ts';
import { redact } from '../../core/redact.ts';
import type { View } from '../device.ts';

type Report = z.infer<typeof clientErrorReport>;

// Redact before cutting: a cut can split an email or token so that redact no longer sees it.
const clip = (text: string, max: number) => redact(text).slice(0, max);
const bytes = (r: Report) => new TextEncoder().encode(JSON.stringify(r)).length;

export function browserOf(ua: string): Report['browser'] {
  if (ua.includes('SamsungBrowser/')) return 'samsung';
  if (/Edg(A|iOS)?\//.test(ua)) return 'edge';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'firefox';
  if (/Chrome\/|CriOS\//.test(ua)) return 'chrome';
  if (ua.includes('Safari/')) return 'safari';
  return 'other';
}

export function toReport(err: Error, view: Report['view'], ua: string): Report {
  const report: Report = {
    errorName: clip(err.name, 100),
    message: clip(err.message, 500),
    frames: parseStack(err)
      .slice(0, 20)
      .map((f) => ({ ...f, file: fileName(f.file).slice(-200), fn: clip(f.fn, 100) })),
    appVersion: import.meta.env.VITE_APP_VERSION || 'dev',
    view,
    browser: browserOf(ua),
  };
  while (bytes(report) > 4096 && report.frames.length) report.frames.pop(); // bodyLimit counts UTF-8 bytes
  return report;
}

let roomView: View | null = null;
/** RoomPage tells which room view is on screen; null when it leaves. */
export const setRoomView = (view: View | null) => {
  roomView = view;
};

// Ordered by when each report was made (seq), not when its hash finished: digests resolve in any order.
let recent: { fp: string; seq: number }[] = [];
let seq = 0;
/** US3: fingerprints of the last 5 distinct reports sent, newest first, for the user's bug report context. The Worker computes the
 * same one for frames in the deployed build: it keeps those file names and redacts nothing a clipped report still has. */
export const recentFingerprints = () => recent.map((r) => r.fp);
function remember(fp: string, at: number) {
  const same = recent.find((r) => r.fp === fp);
  recent = [...recent.filter((r) => r.fp !== fp), { fp, seq: Math.max(at, same?.seq ?? 0) }].sort((a, b) => b.seq - a.seq).slice(0, 5);
}
const sha256 = (text: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));

const bucket = new RateBucket({ capacity: 10, windowMs: 60_000 }); // per tab, same count as the Worker's per-IP limit

export function reportError(err: unknown, now = Date.now()): void {
  // Not an Error (cross-origin "Script error.", a rejected string): no stack to fingerprint.
  if (!(err instanceof Error) || !bucket.take(now).ok) return;
  try {
    const view = location.pathname === '/admin' ? 'admin' : (roomView ?? 'board');
    const report = toReport(err, view, navigator.userAgent);
    const body = JSON.stringify(report);
    const at = ++seq;
    fingerprint(report.errorName, report.frames, sha256).then((fp) => remember(fp, at), () => {});
    // A failed send must not become another unhandled rejection.
    fetch('/api/bug-reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {
    // the collector never throws into the page
  }
}

/** Once, at startup. Uncaught render errors reach `error` too (React 19 reportError); caught ones come through onCaughtError. */
export function installCollector(target: EventTarget = window): void {
  target.addEventListener('error', (e) => reportError((e as ErrorEvent).error));
  target.addEventListener('unhandledrejection', (e) => reportError((e as PromiseRejectionEvent).reason));
}
