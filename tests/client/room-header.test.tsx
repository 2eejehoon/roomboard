import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClosedNotice, RoomHeader } from '../../src/client/room/RoomPage.tsx';
import { RoomStore } from '../../src/client/state/room-store.ts';
import { createRoomData } from '../../src/core/room-data.ts';

// Roles and wording, not exact markup, so Astryx's wrappers can change (T106).
const text = (html: string) => html.replace(/<[^>]+>/g, '');
const within = (tag: string, words: string) => new RegExp(`<${tag}\\b[^>]*>(?:(?!</${tag}>).)*${words}`, 's');
const role = (name: string, words: string) => new RegExp(`role="${name}"[^>]*>.*${words}`, 's');

const room = { id: 'seedroom01', title: '시드 방', description: '', roomData: createRoomData('cafe') };
const peer = (peerId: string) => ({ peerId, nickname: peerId, avatarId: 'char-01', p: [0, 0, 4] as [number, number, number], r: 0, a: 'idle' as const });

function stateWith(peers: number) {
  const s = new RoomStore();
  s.apply({
    t: 'welcome',
    v: 2,
    you: { peerId: 'me', nickname: '느긋한 수달', avatarId: 'char-03' },
    channel: 2,
    room,
    peers: Array.from({ length: peers }, (_, i) => peer(`p${i}`)),
    spawn: [0, 0, 4],
    arena: { blocks: [], fighters: [], match: null }, at: 0,
  });
  return s;
}

describe('RoomHeader (screens.md S3 공통 영역)', () => {
  it('shows the title, channel, people in my channel out of 20 and my nickname', () => {
    const words = text(renderToStaticMarkup(<RoomHeader title="시드 방" state={stateWith(2).getState()} />));
    expect(words).toContain('시드 방');
    expect(words).toContain('채널 2');
    expect(words).toContain('3/20');
    expect(words).toContain('느긋한 수달');
    expect(words).not.toContain('다시 연결 중');
  });

  it('shows the reconnecting band while the socket reconnects', () => {
    const s = stateWith(0);
    s.setConnection('reconnecting');
    expect(renderToStaticMarkup(<RoomHeader title="시드 방" state={s.getState()} />)).toMatch(role('status', '다시 연결 중…'));
  });
});

describe('RoomHeader: the match (US4, T049, FR-025~027)', () => {
  const send = () => {};
  // Me and p0 in the arena (x 20~44), p1 in the peace zone.
  function arena() {
    const s = stateWith(2);
    s.apply({ t: 'correction', p: [31.5, 1, 4.5], r: 0 });
    s.apply({ t: 'peer_moved', peerId: 'p0', p: [33.5, 1, 4.5], r: 0, a: 'idle' });
    return s;
  }
  const html = (s: RoomStore) => renderToStaticMarkup(<RoomHeader title="시드 방" state={s.getState()} brawl={send} />);

  it('offers the start only in the arena with two or more there', () => {
    expect(html(arena())).toMatch(within('button', '판 시작'));
    expect(html(stateWith(2))).not.toContain('판 시작');
    const alone = stateWith(0);
    alone.apply({ t: 'correction', p: [31.5, 1, 4.5], r: 0 });
    expect(html(alone)).not.toContain('판 시작');
  });

  it('while running shows the time left and everyone\'s stocks, and no start', () => {
    const s = arena();
    s.apply({ t: 'match', state: 'running', endsAt: 300_000, players: [{ peerId: 'me', stocks: 3 }, { peerId: 'p0', stocks: 2 }], at: 0 }, 0);
    const words = text(html(s));
    expect(words).not.toContain('판 시작');
    expect(words).toMatch(/남은 시간 \d:\d\d/);
    expect(words).toContain('느긋한 수달 목숨 3');
    expect(words).toContain('p0 목숨 2');
  });

  it('after the end shows the ranks, a gone player by a fallback name', () => {
    const s = arena();
    s.apply({ t: 'match', state: 'running', endsAt: 300_000, players: [{ peerId: 'me', stocks: 3 }, { peerId: 'p0', stocks: 3 }], at: 0 }, 0);
    s.apply({ t: 'match', state: 'ended', ranks: [{ peerId: 'me', rank: 1 }, { peerId: 'gone', rank: 2 }], at: 1000 }, 1000);
    const words = text(html(s));
    expect(words).toContain('판 결과');
    expect(words).toContain('1위 느긋한 수달');
    expect(words).toContain('2위 나간 사람');
  });
});

describe('ClosedNotice (websocket.md 닫힘 코드 표)', () => {
  const html = (code: number) => renderToStaticMarkup(<ClosedNotice code={code} />);

  it('4002 asks for a reload', () => {
    expect(html(4002)).toMatch(role('alert', '새 버전이 있어요'));
    expect(html(4002)).toMatch(within('button', '새로고침'));
  });

  it('4001 is the deleted-room modal with 확인 (screens.md S3 방이 삭제됨)', () => {
    expect(html(4001)).toMatch(role('alertdialog', '이 방은 삭제됐어요'));
    expect(html(4001)).toMatch(within('button', '확인'));
    expect(html(4001).match(/<button\b/g)).toHaveLength(1); // no cancel: there is no room to stay in
    expect(html(4001)).toMatch(/role="alertdialog"[^>]*aria-labelledby="room-deleted"/); // named by its text (PR #36 review)
    expect(html(4001)).toMatch(/id="room-deleted"[^>]*>이 방은 삭제됐어요/);
  });

  it.each([4008, 1003, 1009])('%i says the connection ended and offers a reload', (code) => {
    expect(html(code)).toMatch(role('alert', '연결이 끊겼어요'));
    expect(html(code)).toMatch(within('button', '새로고침'));
  });
});
