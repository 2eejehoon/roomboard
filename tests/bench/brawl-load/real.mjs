// T054 (research R1, quickstart 4): the R1 scenario against the real server. Fake clients join over the v2 protocol, walk onto
// the theme's arena entrance, then walk and fight like clients.mjs: move at 10/s, a skill at skillsPerSec each (jab 3 : smash 1 : throw 1).
// Usage: node tests/bench/brawl-load/real.mjs <baseUrl> <roomId|-> <N> [seconds=20] [skillsPerSec=3]
//   roomId "-" creates a cafe room with the Turnstile test token (local only). A preview needs a cafe room made in a browser:
//   the clients walk onto the cafe's arena entrance.
//   SPREAD=1 puts clients 3 m apart, out of reach: nobody flies, every move is relayed and every skill is an empty swing to all.
//   BUILD=1 (007, with SPREAD=1): instead of skills each client faces +z and places then breaks a dirt block in front of it at
//   skillsPerSec (at most TUNING.blockRate 4), so every page in the channel rebuilds its arena that often per client.
// Two processes on the same room fill two channels (the server assigns channels, 20 each). Latency: skill send → the attacker's
// swing and → the last peer's swing, matched by (attacker, at) since only the attacker's copy carries the nonce. Exits 1 when a
// client never reaches the arena or no swing came back, so a protocol mistake cannot print a plausible table.
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const [BASE, ROOM_ARG, N, SECONDS = 20, RATE = 3] = process.argv.slice(2).map((a, i) => (i < 2 ? a : Number(a)));
if (!BASE || !ROOM_ARG || !(N > 0)) throw new Error('usage: real.mjs <baseUrl> <roomId|-> <N> [seconds] [skillsPerSec]');
const SPREAD = process.env.SPREAD === '1';
const BUILD = process.env.BUILD === '1';
const WARMUP_MS = 3000;
// The cafe theme (src/core/themes.ts) and the arena (src/core/brawl/tuning.ts): x 20..44, z 0..24, floor top y 1, exit cell at x 20, z 12.
const ENTRANCE = [5.5, 0, 2.5];
// Clustered: a home in a 2 m square. Spread: a 5-wide grid, 3 m apart.
const home = (i) => (SPREAD ? [26 + (i % 5) * 3, 4 + Math.floor(i / 5) * 3] : [31 + Math.random() * 2, 11 + Math.random() * 2]);
const STEP = 0.4; // m per 100 ms move plus 0.1 wander: 6 m/s, under MAX_SPEED 8 m/s even when a timer fires early

async function roomId() {
  if (ROOM_ARG !== '-') return ROOM_ARG;
  const body = { title: `bench ${N}`, description: 'T054', themeId: 'cafe', password: 'bench-pass', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' };
  const res = await fetch(`${BASE}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status !== 201) throw new Error(`create room: ${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

const room = await roomId();
const wsUrl = `${BASE.replace(/^http/, 'ws')}/api/rooms/${room}/ws`;
const records = new Map(); // `${attacker}:${at}` -> { sent, arrivals }
const toAttacker = [];
const toLastPeer = [];
let bytes = 0, msgs = 0, sentSkills = 0, corrections = 0, blocksBack = 0, measuring = false;
// A busy client reads frames late and inflates the max-of-peers tail: a large lag means the client, not the server, is measured.
const lag = monitorEventLoopDelay({ resolution: 10 });

function onSwing(c, m, now) {
  const key = `${m.peerId}:${m.at}`;
  const r = records.get(key) ?? { arrivals: [] };
  records.set(key, r);
  if (m.peerId === c.peerId) {
    r.sent = c.nonces.get(m.nonce);
    if (measuring && r.sent !== undefined) toAttacker.push(now - r.sent);
  } else r.arrivals.push(now);
  const peers = channelSize(c.channel) - 1;
  if (r.sent !== undefined && r.arrivals.length === peers) {
    if (measuring && peers > 0) toLastPeer.push(Math.max(...r.arrivals) - r.sent);
    records.delete(key);
  }
}

const clients = [];
const channelSize = (ch) => clients.filter((c) => c.channel === ch).length;

function connect(i) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const c = { i, ws, home: home(i), p: null, r: 0, seq: 0, nonces: new Map(), inArena: false };
    setTimeout(() => reject(new Error(`client ${i}: not in the arena after 10 s`)), 10_000);
    ws.onerror = () => reject(new Error(`client ${i}: socket error`));
    ws.onclose = (e) => c.inArena || reject(new Error(`client ${i}: closed ${e.code} before the arena`));
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', v: 2, deviceKey: crypto.randomUUID() }));
    ws.onmessage = ({ data }) => {
      const now = performance.now();
      if (measuring) [bytes, msgs] = [bytes + data.length, msgs + 1];
      const m = JSON.parse(data);
      if (m.t === 'welcome') {
        [c.peerId, c.channel, c.p] = [m.you.peerId, m.channel, m.spawn];
        // lastMoveAt is the join time: wait out the 8 m/s check, then step onto the entrance cell.
        setTimeout(() => ws.send(JSON.stringify({ t: 'move', p: ENTRANCE, r: 0, a: 'walk' })), 1000);
      } else if (m.t === 'correction') {
        c.p = m.p;
        if (measuring) corrections++; // walking wrong: a high count means the moves are measuring rejections
        if (!c.inArena && m.p[0] >= 20) {
          c.inArena = true;
          resolve(c);
        }
      } else if ((m.t === 'landed' || m.t === 'respawned') && m.peerId === c.peerId) c.p = m.p; // walk on from where the server put us
      else if (m.t === 'swing') onSwing(c, m, now);
      else if (m.t === 'block' && measuring) blocksBack++;
    };
  });
}

// Joins 100 ms apart.
const joining = [];
for (let i = 0; i < N; i++) {
  joining.push(connect(i));
  await new Promise((r) => setTimeout(r, 100));
}
clients.push(...(await Promise.all(joining)));

// A step toward home (from the start cell, or wherever a flight landed) plus a little wander.
const toward = (v, target) => v + Math.max(-STEP, Math.min(STEP, target - v)) + (Math.random() - 0.5) * 0.2;
const timers = clients.flatMap((c) => [
  setInterval(() => {
    c.p = [toward(c.p[0], c.home[0]), 1, toward(c.p[2], c.home[1])];
    if (!BUILD) c.r += (Math.random() - 0.5) * 0.6;
    c.ws.send(JSON.stringify({ t: 'move', p: c.p.map((v) => Math.round(v * 100) / 100), r: Math.round(c.r * 100) / 100, a: 'walk' }));
  }, 100),
  setInterval(() => {
    if (BUILD) {
      if (measuring) sentSkills++;
      c.ws.send(JSON.stringify(c.seq++ % 2 ? { t: 'block', op: 'break', h: 0 } : { t: 'block', op: 'place', kind: 'dirt', h: 0 }));
      return;
    }
    const nonce = `n${++c.seq}`;
    c.nonces.set(nonce, performance.now());
    if (measuring) sentSkills++;
    c.ws.send(JSON.stringify({ t: 'skill', k: ['jab', 'jab', 'jab', 'smash', 'throw'][c.seq % 5], nonce }));
  }, 1000 / RATE),
]);

const start = performance.now();
// The walk home from the start cells takes up to ~2 s, inside the warmup.
setTimeout(() => {
  measuring = true;
  lag.enable();
}, WARMUP_MS);
setTimeout(() => {
  timers.forEach(clearInterval);
  const secs = (performance.now() - start - WARMUP_MS) / 1000;
  const pct = (a, q) => (a.length ? a.toSorted((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))].toFixed(1) : '-');
  const row = (a) => `p50 ${pct(a, 0.5)} p95 ${pct(a, 0.95)} p99 ${pct(a, 0.99)} max ${pct(a, 1)} (n=${a.length})`;
  const channels = [...new Set(clients.map((c) => c.channel))];
  console.log(JSON.stringify({
    N, spread: SPREAD, build: BUILD, room, channels, seconds: SECONDS, skillsPerSec: RATE,
    skillsSent: sentSkills, swingsBack: toAttacker.length, corrections,
    ...(BUILD && { blockChangesPerClientPerSec: +(blocksBack / N / secs).toFixed(1) }),
    attackerMs: row(toAttacker),
    lastPeerMs: N > 1 ? row(toLastPeer) : '-',
    perClientMsgsPerSec: +(msgs / N / secs).toFixed(1),
    perClientKBPerSec: +(bytes / N / secs / 1024).toFixed(1),
    clientLoopLagP99Ms: +(lag.percentile(99) / 1e6).toFixed(1),
  }));
  clients.forEach((c) => c.ws.close());
  process.exit((BUILD ? blocksBack : toAttacker.length) ? 0 : 1);
}, SECONDS * 1000);
