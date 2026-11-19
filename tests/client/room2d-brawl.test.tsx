// T026: the 2D brawl (FR-033, R8): a side view of my depth row, buttons, and a live log a screen reader reads.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Room2D } from '../../src/client/room/room2d/Room2D.tsx';
import { RoomStore } from '../../src/client/state/room-store.ts';
import { createRoomData } from '../../src/core/room-data.ts';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const room = { id: 'seedroom01', title: '시드 방', description: '', roomData: createRoomData('cafe') };
const noop = () => {};

function store(me: [number, number, number]) {
  const s = new RoomStore();
  s.apply({
    t: 'welcome',
    v: 2,
    you: { peerId: 'me', nickname: '느긋한 수달', avatarId: 'char-03' },
    channel: 1,
    room,
    peers: [
      { peerId: 'a', nickname: '용감한 여우', avatarId: 'char-01', p: [31.5, 1, 4.5], r: 0, a: 'idle' },
      { peerId: 'c', nickname: '조용한 곰', avatarId: 'char-02', p: [33.5, 1, 7.5], r: 0, a: 'idle' },
    ],
    spawn: [0, 0, 4],
    arena: { blocks: [], fighters: [{ peerId: 'a', damage: 7, launch: null, stocks: null }], match: null },
    at: 0,
  }, 0);
  s.moveSelf(me, Math.PI / 2, 'idle');
  return s;
}
const render = (s: RoomStore) => renderToStaticMarkup(<Room2D room={room} state={s.getState()} move={noop} brawl={noop} />);

describe('Room2D brawl (FR-033)', () => {
  it('in the peace zone offers the way to the arena and no skill buttons (FR-013)', () => {
    const html = render(store([0, 0, 4]));
    expect(text(html)).toContain('경기장으로 가기');
    expect(text(html)).not.toContain('잽');
  });

  it('in the arena draws the side view with my row strong, others faint with their depth difference', () => {
    const html = render(store([30.5, 1, 4.5]));
    expect(html).toMatch(/<svg[^>]*role="img"[^>]*aria-label="[^"]*경기장/);
    // a stands in my row (z 4), c three rows behind (z 7).
    expect(html).toMatch(/data-peer="a"[^>]*opacity="1"/);
    expect(html).toMatch(/data-peer="c"[^>]*opacity="0.4"/);
    expect(text(html)).toContain('+3');
  });

  it('has move, row, facing and skill buttons in the arena', () => {
    const t = text(render(store([30.5, 1, 4.5])));
    for (const label of ['왼쪽', '오른쪽', '앞 줄', '뒤 줄', '잽', '강펀치', '던지기', '방어', '구르기']) expect(t).toContain(label);
  });

  it('a knocked-out fighter below the island keeps the arena view, not the way in (PR #88 review)', () => {
    const s = store([43.5, -10, 4.5]);
    s.apply({ t: 'knocked_out', peerId: 'me', respawnAt: 3300, stocks: null, out: false, at: 300 }, 400);
    const html = text(render(s));
    expect(html).not.toContain('경기장으로 가기');
    expect(html).toContain('잽');
  });

  it('logs hits and knock-outs with names and % in the live region', () => {
    const s = store([30.5, 1, 4.5]);
    s.apply({
      t: 'swing',
      peerId: 'me',
      k: 'jab',
      step: 1,
      at: 100,
      hitstopMs: 35,
      readyAt: 485,
      hits: [{ peerId: 'a', damage: 10, guarded: false, hitstopMs: 35, launch: { t: 135, p: [31.5, 1, 4.5], v: [0.78, 0, 0], s: 1.3, cause: 'hit' } }],
    }, 200);
    s.apply({ t: 'knocked_out', peerId: 'a', respawnAt: 3300, stocks: null, out: false, at: 300 }, 400);
    expect(text(render(s))).toMatch(/느긋한 수달 님이 용감한 여우 님을 쳤어요 \(10%\).*용감한 여우 님이 떨어졌어요/);
  });
});
