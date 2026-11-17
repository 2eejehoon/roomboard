// 002 T037 (research R4, precedent 2026-11-17-client-collector): client errors to POST /api/bug-reports. The Worker drops a report
// that misses the schema or 4KB without saying so, so this side redacts, cuts and fits before sending.
import type { z } from 'zod';
import type { clientErrorReport } from '../../core/api-schemas.ts';
import { fileName, parseStack } from '../../core/fingerprint.ts';
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

const bucket = new RateBucket({ capacity: 10, windowMs: 60_000 }); // per tab, same count as the Worker's per-IP limit

export function reportError(err: unknown, now = Date.now()): void {
  // Not an Error (cross-origin "Script error.", a rejected string): no stack to fingerprint.
  if (!(err instanceof Error) || !bucket.take(now).ok) return;
  try {
    const view = location.pathname === '/admin' ? 'admin' : (roomView ?? 'board');
    const body = JSON.stringify(toReport(err, view, navigator.userAgent));
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
