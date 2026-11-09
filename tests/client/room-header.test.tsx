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
    v: 1,
    you: { peerId: 'me', nickname: '느긋한 수달', avatarId: 'char-03' },
    channel: 2,
    room,
    peers: Array.from({ length: peers }, (_, i) => peer(`p${i}`)),
    spawn: [0, 0, 4],
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
  });

  it.each([4008, 1003, 1009])('%i says the connection ended and offers a reload', (code) => {
    expect(html(code)).toMatch(role('alert', '연결이 끊겼어요'));
    expect(html(code)).toMatch(within('button', '새로고침'));
  });
});
