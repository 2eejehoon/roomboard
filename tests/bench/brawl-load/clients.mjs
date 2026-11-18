// Usage: node tests/bench/brawl-load/clients.mjs <N> [seconds=20] [skillsPerSec=3] [room=fresh] [channel=1] [url=ws://127.0.0.1:8787]
// Same room and different channels in two processes load one DO with two brawling channels.
// SPREAD=1 puts clients 3 m apart, out of reach: nobody flies, so every move is relayed and every skill is a swing to all.
// N fake clients in one channel: move at 10/s (MOVE_RATE) and a skill at skillsPerSec each, all close together so most
// skills hit. Prints latency from skill send to the attacker's result and to the last peer, and per-client downlink.
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const args = process.argv.slice(2);
const [N, SECONDS = 20, RATE = 3] = args.slice(0, 3).map(Number);
const [ROOM, CH = '1', URL = 'ws://127.0.0.1:8787'] = args.slice(3);
const WARMUP_MS = 3000;
const SPREAD = process.env.SPREAD === '1';
const room = ROOM ?? `bench-${N}-${Date.now()}`;
const sent = new Map(); // skill id -> { at, peers: remaining count, last: ms }
const toAttacker = [];
const toLastPeer = [];
let bytes = 0, msgs = 0, measuring = false;
const lag = monitorEventLoopDelay({ resolution: 10 });

const kinds = ['jab', 'jab', 'jab', 'smash', 'throw'];
const clients = await Promise.all(
  Array.from({ length: N }, (_, i) => new Promise((resolve) => {
    const ws = new WebSocket(`${URL}/${room}?ch=${CH}`);
    // Clustered: a 2 m square. Spread: own 3 m cell on a 5-wide grid from (6, 6), walking within ±0.5 m.
    const home = SPREAD ? [6 + (i % 5) * 3, 6 + Math.floor(i / 5) * 3] : [16, 16];
    const c = { i, ws, home, p: [home[0] - 1 + Math.random() * 2, 1, home[1] - 1 + Math.random() * 2], r: Math.random() * 2 * Math.PI, seq: 0 };
    ws.onopen = () => resolve(c);
    ws.onmessage = ({ data }) => {
      const now = performance.now();
      if (measuring) { bytes += data.length; msgs++; }
      const m = JSON.parse(data);
      if (m.t === 'you') c.peerId = m.peerId;
      if (m.t === 'knocked_out' || m.t === 'landed' || m.t === 'correction') {
        if (m.peerId === undefined || m.peerId === c.peerId) c.p = m.p;
      }
      const s = (m.t === 'skill' || m.t === 'skill_result') && sent.get(m.id);
      if (!s) return;
      if (m.t === 'skill_result') s.result = toAttacker.push(now - s.at);
      else if (--s.peers === 0) toLastPeer.push(now - s.at);
      if (s.result && s.peers === 0) sent.delete(m.id);
    };
  })),
);

const start = performance.now();
setTimeout(() => { measuring = true; lag.enable(); toAttacker.length = 0; toLastPeer.length = 0; }, WARMUP_MS);
const timers = clients.flatMap((c) => [
  setInterval(() => {
    // Small random walk near home, well under MAX_SPEED.
    const box = SPREAD ? 0.5 : 2;
    const walk = (v, h) => Math.min(h + box, Math.max(h - box, v + (Math.random() - 0.5) * 0.4));
    c.p = [walk(c.p[0], c.home[0]), 1, walk(c.p[2], c.home[1])];
    c.r += (Math.random() - 0.5) * 0.6;
    c.ws.send(JSON.stringify({ t: 'move', p: c.p, r: c.r, a: 'walk' }));
  }, 100),
  setInterval(() => {
    const id = `${c.i}.${++c.seq}`;
    sent.set(id, { at: performance.now(), peers: N - 1 });
    c.ws.send(JSON.stringify({ t: 'skill', id, k: kinds[c.seq % kinds.length], c: 1 }));
  }, 1000 / RATE),
]);

setTimeout(() => {
  timers.forEach(clearInterval);
  const secs = (performance.now() - start - WARMUP_MS) / 1000;
  const pct = (a, q) => (a.length ? a.toSorted((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))].toFixed(1) : '-');
  const row = (a) => `p50 ${pct(a, 0.5)} p95 ${pct(a, 0.95)} p99 ${pct(a, 0.99)} max ${pct(a, 1)} (n=${a.length})`;
  console.log(JSON.stringify({
    N, spread: SPREAD, channel: CH, seconds: SECONDS, skillsPerSec: RATE,
    attackerMs: row(toAttacker),
    lastPeerMs: N > 1 ? row(toLastPeer) : '-',
    perClientMsgsPerSec: +(msgs / N / secs).toFixed(1),
    perClientKBPerSec: +(bytes / N / secs / 1024).toFixed(1),
    clientLoopLagP99Ms: +(lag.percentile(99) / 1e6).toFixed(1),
  }));
  clients.forEach((c) => c.ws.close());
  process.exit(0);
}, SECONDS * 1000);
