// Room WebSocket client (contracts/websocket.md): join, ping, reconnect with backoff, close codes, move throttle.
import { CLOSE, PROTOCOL_VERSION, serverMessageSchema } from '../../core/protocol.ts';
import type { Pose } from '../../core/room-session.ts';
import type { Vec3 } from '../../core/themes.ts';
import type { RoomStore } from '../state/room-store.ts';

const PING_MS = 20_000;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15_000];
const MOVE_INTERVAL_MS = 200; // at most 5 a second
// websocket.md close table: these mean a bug or a final state, so reconnecting would not help.
const FINAL = new Set<number>([CLOSE.normal, CLOSE.binary, CLOSE.tooLarge, CLOSE.roomDeleted, CLOSE.unsupportedVersion, CLOSE.badMessages]);
const round = (n: number) => Math.round(n * 100) / 100;

type Options = { url: string; deviceKey: string; store: RoomStore; WS?: typeof WebSocket; random?: () => number };
export type RoomSocket = { move(p: Vec3, r: number, a: Pose['a']): void; close(): void };

export function openRoomSocket({ url, deviceKey, store, WS = WebSocket, random = Math.random }: Options): RoomSocket {
  let ws: WebSocket;
  let attempt = 0;
  let stopped = false;
  let ping: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  // Last pose sent (or the spawn from welcome), the pose waiting for the throttle, and when the last one went out.
  let sentKey = '';
  let pending: { p: Vec3; r: number; a: Pose['a'] } | null = null;
  let lastSentAt = -Infinity;
  let flush: ReturnType<typeof setTimeout> | undefined;

  const poseKey = (p: Vec3, r: number, a: string) => JSON.stringify([p, r, a]);

  function connect() {
    ws = new WS(url);
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, deviceKey }));
      ping = setInterval(() => ws.send('ping'), PING_MS);
    };
    ws.onmessage = (e: MessageEvent) => {
      if (e.data === 'pong') return;
      const parsed = serverMessageSchema.safeParse(JSON.parse(String(e.data)));
      if (!parsed.success) return;
      if (parsed.data.t === 'welcome') {
        attempt = 0;
        sentKey = poseKey(parsed.data.spawn, 0, 'idle');
      }
      store.apply(parsed.data);
    };
    ws.onclose = (e: CloseEvent) => {
      clearInterval(ping);
      clearTimeout(flush);
      flush = undefined; // move() schedules only while this is unset
      pending = null;
      if (stopped || FINAL.has(e.code)) return store.setConnection('closed', stopped ? null : e.code);
      store.setConnection('reconnecting');
      const base = BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)];
      retry = setTimeout(connect, base * (0.8 + random() * 0.4));
    };
  }

  function send() {
    flush = undefined;
    if (!pending) return;
    const { p, r, a } = pending;
    pending = null;
    lastSentAt = Date.now();
    sentKey = poseKey(p, r, a);
    ws.send(JSON.stringify({ t: 'move', p, r, a }));
  }

  connect();
  return {
    move(p, r, a) {
      if (store.getState().connection !== 'open') return;
      const pose = { p: p.map(round) as Vec3, r: round(r), a };
      store.moveSelf(pose.p, pose.r, a);
      if (poseKey(pose.p, pose.r, a) === sentKey) {
        pending = null;
        return;
      }
      pending = pose;
      flush ??= setTimeout(send, Math.max(0, lastSentAt + MOVE_INTERVAL_MS - Date.now()));
    },
    close() {
      stopped = true;
      clearTimeout(retry);
      ws.close(CLOSE.normal);
      store.setConnection('closed'); // also when the close lands between retries, where no close event follows
    },
  };
}
