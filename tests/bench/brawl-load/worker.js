// 004 plan measurement (research.md R1): a stand-in room DO with the brawl load the plan designs, not the real code.
// It mirrors room-do.ts deliver() (JSON.stringify and send() per recipient) and the planned judgment: reach check over the
// channel, FR-002 knockback, a fixed-step trajectory against a block grid, and one alarm for the next event instant.
/* global WebSocketPair */
import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';

// Provisional values for the bench only; the real ones live in the tuning table (FR-030).
const T = { dt: 1 / 60, gravity: 20, speedPerStrength: 0.6, reach: 1.6, ko: -10, wallBounce: 0.5, breakDirt: 3, breakStone: 10, maxSteps: 600 };
const SKILLS = {
  jab: { dmg: 3, base: 1, growth: 0.1, angle: 0, cooldownMs: 300 },
  smash: { dmg: 22, base: 6, growth: 1.2, angle: 35, cooldownMs: 800 },
  throw: { dmg: 10, base: 5, growth: 0.9, angle: 45, cooldownMs: 600 },
};
// Parsed like protocol.ts parseClientMessage, so validation cost is in the numbers.
const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const clientMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('move'), p: vec3, r: z.number(), a: z.enum(['idle', 'walk', 'run', 'jump']) }),
  z.object({ t: z.literal('skill'), id: z.string().max(32), k: z.enum(['jab', 'smash', 'throw']), c: z.number().min(0).max(1) }),
]);
const W = 32, H = 16, D = 32; // grid cells; cell (x,y,z) covers [x,x+1) etc.
const idx = (x, y, z) => (y * D + z) * W + x;

function defaultGrid() {
  const g = new Uint8Array(W * H * D); // 0 empty, 1 dirt, 2 stone
  for (let x = 4; x < 28; x++) for (let z = 4; z < 28; z++) g[idx(x, 0, z)] = 2;
  for (let x = 10; x < 14; x++) for (let y = 1; y < 4; y++) g[idx(x, y, 16)] = 1; // a dirt wall to hit
  return g;
}

function cell(g, p) {
  const [x, y, z] = p.map(Math.floor);
  if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D) return 0;
  return g[idx(x, y, z)];
}

// Segments until land, KO or step cap; walls reflect or break (FR-019), each bounce starts a new segment.
function trajectory(g, start, dir, strength, t0) {
  const segs = [];
  let p = [...start], v = dir.map((d) => d * strength * T.speedPerStrength), s = strength, t = t0;
  for (let seg = 0; seg < 4; seg++) {
    segs.push({ t, p: [...p], v: [...v], s });
    let end = null;
    for (let i = 0; i < T.maxSteps && !end; i++) {
      const prev = p;
      v = [v[0], v[1] - T.gravity * T.dt, v[2]];
      p = [p[0] + v[0] * T.dt, p[1] + v[1] * T.dt, p[2] + v[2] * T.dt];
      t += T.dt * 1000;
      if (p[1] < T.ko) end = { kind: 'ko', t };
      const c = cell(g, p);
      if (!c) continue;
      if (v[1] < 0 && !cell(g, [p[0], prev[1], p[2]])) end = { kind: 'land', t, p: [p[0], Math.floor(p[1]) + 1, p[2]] };
      else if (s >= (c === 1 ? T.breakDirt : T.breakStone)) g[idx(...p.map(Math.floor))] = 0;
      else end = { kind: 'wall', t, p: prev };
    }
    if (!end || end.kind !== 'wall') return { segs, end: end ?? { kind: 'cap', t } };
    p = end.p;
    v = [-v[0] * T.wallBounce, v[1] * T.wallBounce, -v[2] * T.wallBounce];
    s *= T.wallBounce;
  }
  return { segs, end: { kind: 'cap', t } };
}

export class BenchRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.peers = new Map(); // peerId -> { ws, p, r, dmg, cool: {}, flyUntil, events: [] }
    this.grid = defaultGrid();
    this.seq = 0;
  }

  async fetch(req) {
    const [client, server] = Object.values(new WebSocketPair());
    const peerId = `p_${++this.seq}`;
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ t: 'you', peerId })); // the client needs its id to follow its own landing and KO
    server.serializeAttachment({ peerId });
    // ?ch= puts the socket in a channel; one DO serves every channel of a room (001 research R6).
    const ch = new URL(req.url).searchParams.get('ch') ?? '1';
    this.peers.set(peerId, { ws: server, peerId, ch, p: [16, 1, 16], r: 0, dmg: 0, cool: {}, flyUntil: 0, lastMoveAt: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const me = this.peers.get(ws.deserializeAttachment().peerId);
    if (!me) return;
    const parsed = clientMessage.safeParse(JSON.parse(raw));
    if (!parsed.success) return;
    const msg = parsed.data;
    const now = Date.now();
    this.due(now);
    // room-do.ts onMessage() rewrites the sender's attachment on every message; the brawl adds fighter state to it.
    ws.serializeAttachment(this.attachment(me));
    if (msg.t === 'move') {
      if (now < me.flyUntil) return; // the server owns the pose while flying
      const dist = Math.hypot(msg.p[0] - me.p[0], msg.p[1] - me.p[1], msg.p[2] - me.p[2]);
      if (dist > (8 * Math.max(0, now - me.lastMoveAt)) / 1000 + 0.5) return this.deliver([[me, { t: 'correction', p: me.p, r: me.r }]]);
      me.p = msg.p; me.r = msg.r; me.lastMoveAt = now;
      return this.deliver(this.others(me).map((o) => [o, { t: 'peer_moved', peerId: me.peerId, p: me.p, r: me.r, a: msg.a }]));
    }
    await this.persist(now);
    if (msg.t === 'skill') return this.skill(me, msg, now);
  }

  async skill(me, msg, now) {
    const sk = SKILLS[msg.k];
    if (!sk || now < (me.cool[msg.k] ?? 0) || now < me.flyUntil) return this.deliver([[me, { t: 'skill_result', id: msg.id, ok: false }]]);
    me.cool[msg.k] = now + sk.cooldownMs;
    const face = [Math.sin(me.r), Math.cos(me.r)];
    const hits = [];
    let next = Infinity;
    for (const o of this.others(me)) {
      const dx = o.p[0] - me.p[0], dz = o.p[2] - me.p[2], dist = Math.hypot(dx, dz);
      if (dist > T.reach || now < o.flyUntil || (dist > 0 && (dx * face[0] + dz * face[1]) / dist < 0.5)) continue;
      o.dmg = Math.min(999, o.dmg + sk.dmg);
      const strength = sk.base + o.dmg * sk.growth; // FR-002 with weight 100
      const a = (sk.angle * Math.PI) / 180;
      const dir = [face[0] * Math.cos(a), Math.sin(a), face[1] * Math.cos(a)];
      const hitstop = Math.min(150, 30 + strength * 4);
      const { segs, end } = trajectory(this.grid, o.p, dir, strength, now + hitstop);
      o.flyUntil = end.t;
      o.end = end;
      next = Math.min(next, end.t);
      o.ws.serializeAttachment(this.attachment(o)); // research R6: fighter state lives in the attachment
      hits.push({ peerId: o.peerId, dmg: o.dmg, hitstop, segs, end: end.kind });
    }
    const out = this.others(me).map((o) => [o, { t: 'skill', id: msg.id, peerId: me.peerId, k: msg.k, hits }]);
    out.push([me, { t: 'skill_result', id: msg.id, ok: true, hits }]);
    this.deliver(out);
    if (next < Infinity) await this.schedule(next);
  }

  // Events whose instant has passed: landing hands the pose back, KO respawns at the start point.
  due(now) {
    const out = [];
    for (const o of this.peers.values()) {
      if (!o.end || o.end.t > now) continue;
      const { kind, p } = o.end;
      o.end = null;
      if (kind === 'land') o.p = p;
      if (kind === 'ko') { o.p = [16, 1, 16]; o.dmg = 0; }
      out.push(...[...this.peers.values()].filter((r) => r.ch === o.ch).map((r) => [r, { t: kind === 'ko' ? 'knocked_out' : 'landed', peerId: o.peerId, p: o.p }]));
    }
    this.deliver(out);
  }

  async alarm() {
    this.due(Date.now());
  }

  attachment(o) {
    return { peerId: o.peerId, ch: o.ch, p: o.p, r: o.r, fighter: { damage: o.dmg, cool: o.cool, flyUntil: o.flyUntil, end: o.end ?? null } };
  }

  // research R6: arena:<channel> is written at most every 2 s (blocks) and at once for match events; here every 2 s per channel.
  async persist(now) {
    if (now - (this.persistedAt ?? 0) < 2000) return;
    this.persistedAt = now;
    const chans = new Set([...this.peers.values()].map((o) => o.ch));
    for (const ch of chans) await this.ctx.storage.put(`arena:${ch}`, { blocks: [...this.grid.subarray(0, 2048)], match: { stocks: [...this.peers.values()].filter((o) => o.ch === ch).map((o) => [o.peerId, 3]) } });
  }

  // As room-do.ts deliver(): one stringify and one send per recipient.
  deliver(out) {
    for (const [to, msg] of out) to.ws.send(JSON.stringify(msg));
  }

  others(me) {
    return [...this.peers.values()].filter((o) => o !== me && o.ch === me.ch);
  }

  async schedule(at) {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > at) await this.ctx.storage.setAlarm(at);
  }

  webSocketClose(ws) {
    this.peers.delete(ws.deserializeAttachment().peerId);
  }
}

export default {
  fetch(req, env) {
    const name = new URL(req.url).pathname.slice(1) || 'room';
    return env.ROOM.get(env.ROOM.idFromName(name)).fetch(req);
  },
};
