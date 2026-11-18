import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLOSE, MAX_MESSAGE_BYTES, clientMessageSchema, parseClientMessage, serverMessageSchema } from '../../src/core/protocol.ts';

// websocket.md says protocol.ts is the source of truth and the doc must match it: every JSON example in the doc is checked.
// 001 has v1 and 004 adds the brawl messages of v2 on top; both documents use the same headings.
const read = (path: string) => readFileSync(new URL(`../../specs/${path}`, import.meta.url), 'utf8');
const doc = read('001-realtime-room-board/contracts/websocket.md');
const brawlDoc = read('004-knockback-brawl/contracts/websocket.md');
const examples = (text: string, heading: string) => {
  const section = text.split(/^## /m).find((s) => s.startsWith(heading));
  if (!section) throw new Error(`websocket.md has no "## ${heading}" section`);
  return [...section.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]) as { t: string });
};
const clientExamples = examples(doc, '클라이언트 → 서버');
const serverExamples = examples(doc, '서버 → 클라이언트');
const brawlClientExamples = examples(brawlDoc, '클라이언트 → 서버');
const brawlServerExamples = examples(brawlDoc, '서버 → 클라이언트');
const join = { t: 'join', v: 2, deviceKey: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b' };
const move = { t: 'move', p: [1, 0, 2], r: 0, a: 'walk' };

describe('protocol schemas match websocket.md', () => {
  it('every client → server example parses', () => {
    expect(clientExamples.map((e) => e.t).sort()).toEqual(['chat', 'join', 'move']);
    for (const e of clientExamples) expect(clientMessageSchema.safeParse(e).success, e.t).toBe(true);
  });

  it('every server → client example parses, and every server message type has an example', () => {
    expect(new Set(serverExamples.map((e) => e.t))).toEqual(
      new Set(['welcome', 'peer_joined', 'peer_left', 'peer_moved', 'correction', 'chat', 'rate_limited', 'room_updated', 'room_deleted', 'error']),
    );
    for (const e of serverExamples) expect(serverMessageSchema.safeParse(e).error, e.t).toBeUndefined();
  });

  it('every 004 client → server example parses', () => {
    expect(brawlClientExamples.map((e) => e.t).sort()).toEqual(['air', 'block', 'guard', 'hold', 'match_start', 'move', 'roll', 'skill']);
    for (const e of brawlClientExamples) expect(clientMessageSchema.safeParse(e).error, e.t).toBeUndefined();
  });

  it('every 004 server → client example parses, and every server message type has an example in 001 or 004', () => {
    expect(new Set(brawlServerExamples.map((e) => e.t))).toEqual(
      new Set(['welcome', 'swing', 'launch', 'landed', 'knocked_out', 'respawned', 'block', 'arena_reset', 'match']),
    );
    for (const e of brawlServerExamples) expect(serverMessageSchema.safeParse(e).error, e.t).toBeUndefined();
    const documented = new Set([...serverExamples, ...brawlServerExamples].map((e) => e.t));
    expect(serverMessageSchema.options.map((o) => o.shape.t.value).filter((t) => !documented.has(t))).toEqual([]);
  });

  it('close codes match the table', () => {
    const table = [...doc.matchAll(/^\| (\d{4}) \|/gm)].map((m) => Number(m[1])).sort();
    expect(Object.values(CLOSE).sort()).toEqual(table);
  });
});

describe('parseClientMessage', () => {
  const parse = (m: unknown) => parseClientMessage(JSON.stringify(m));

  it('accepts valid messages and trims chat text', () => {
    expect(parse(join)).toEqual({ ok: true, msg: join });
    expect(parse({ t: 'chat', text: '  hi  ' })).toEqual({ ok: true, msg: { t: 'chat', text: 'hi' } });
  });

  it.each([
    ['unknown type', { t: 'dance' }],
    ['missing field', { t: 'move', p: [0, 0, 0], r: 0 }],
    ['a outside the enum', { ...move, a: 'fly' }],
    ['p with two numbers', { ...move, p: [0, 0] }],
    ['deviceKey not a uuid', { ...join, deviceKey: 'abc' }],
    ['text 201 chars', { t: 'chat', text: 'a'.repeat(201) }],
    ['text only spaces', { t: 'chat', text: '   ' }],
    ['nonce 33 chars', { t: 'chat', text: 'hi', nonce: 'n'.repeat(33) }],
    ['skill nonce 33 chars', { t: 'skill', k: 'jab', nonce: 'n'.repeat(33) }],
    ['move.d longer than 1', { ...move, d: [0.8, 0.7] }],
    ['block.h of 2', { t: 'block', op: 'break', h: 2 }],
    ['block.h of 0.5', { t: 'block', op: 'break', h: 0.5 }],
    ['block place without kind', { t: 'block', op: 'place', h: 0 }],
    ['block break with kind', { t: 'block', op: 'break', kind: 'dirt', h: 0 }],
    ['block kind outside the enum', { t: 'block', op: 'place', kind: 'glass', h: 0 }],
  ])('rejects %s as bad_message', (_, m) => {
    expect(parse(m)).toEqual({ ok: false, reason: 'bad_message' });
  });

  it('chat text limit counts characters, not UTF-16 units', () => {
    expect(parse({ t: 'chat', text: '😀'.repeat(200) }).ok).toBe(true);
    expect(parse({ t: 'chat', text: '😀'.repeat(201) })).toEqual({ ok: false, reason: 'bad_message' });
  });

  it('accepts move.d up to length 1, with room for a normalized vector that rounds a hair over', () => {
    expect(parse({ ...move, d: [1, 0] }).ok).toBe(true);
    expect(parse({ ...move, d: [Math.SQRT1_2, Math.SQRT1_2] }).ok).toBe(true);
    expect(parse({ t: 'block', op: 'place', kind: 'stone', h: -1 }).ok).toBe(true);
  });

  it('answers join v1 with the version check, not bad_message (the join schema takes any integer)', () => {
    expect(parse({ ...join, v: 1 })).toEqual({ ok: true, msg: { ...join, v: 1 } });
  });

  it('rejects text that is not JSON', () => {
    expect(parseClientMessage('{nope')).toEqual({ ok: false, reason: 'bad_message' });
  });

  it('rejects messages over 2KB in UTF-8 bytes as too_large', () => {
    expect(MAX_MESSAGE_BYTES).toBe(2048);
    const frame = (fill: string) => JSON.stringify({ t: 'chat', text: 'x', pad: fill });
    const base = frame('').length;
    expect(parseClientMessage(frame('a'.repeat(2048 - base))).ok).toBe(true);
    expect(parseClientMessage(frame('a'.repeat(2049 - base)))).toEqual({ ok: false, reason: 'too_large' });
    // 700 Korean chars are 2,100 bytes but only 700 UTF-16 units.
    expect(parseClientMessage(frame('가'.repeat(700)))).toEqual({ ok: false, reason: 'too_large' });
    // Same count as Node's UTF-8 encoder, including emoji pairs and lone surrogates (3-byte replacement character).
    const raw = (fill: string) => `{"t":"chat","text":"x","pad":"${fill}"}`;
    for (const unit of ['😀', '\uD800가', 'a\uDC00']) {
      const n = Math.floor((2048 - Buffer.byteLength(raw(''))) / Buffer.byteLength(unit));
      for (const count of [n, n + 1]) {
        const frame = raw(unit.repeat(count));
        expect(parseClientMessage(frame).ok, `${count}× ${JSON.stringify(unit)}`).toBe(Buffer.byteLength(frame) <= 2048);
      }
    }
  });
});
