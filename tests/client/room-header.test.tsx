import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClosedNotice, RoomHeader } from '../../src/client/room/RoomPage.tsx';
import { RoomStore } from '../../src/client/state/room-store.ts';
import { createRoomData } from '../../src/core/room-data.ts';

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
    const html = renderToStaticMarkup(<RoomHeader title="시드 방" state={stateWith(2).getState()} />);
    expect(html).toContain('시드 방');
    expect(html).toContain('채널 2');
    expect(html).toContain('3/20');
    expect(html).toContain('느긋한 수달');
    expect(html).not.toContain('다시 연결 중');
  });

  it('shows the reconnecting band while the socket reconnects', () => {
    const s = stateWith(0);
    s.setConnection('reconnecting');
    expect(renderToStaticMarkup(<RoomHeader title="시드 방" state={s.getState()} />)).toMatch(/role="status"[^>]*>다시 연결 중…/);
  });
});

describe('ClosedNotice (websocket.md 닫힘 코드 표)', () => {
  const html = (code: number) => renderToStaticMarkup(<ClosedNotice code={code} />);

  it('4002 asks for a reload', () => {
    expect(html(4002)).toMatch(/role="alert".*새 버전이 있어요.*<button[^>]*>새로고침<\/button>/);
  });

  it('4001 is the deleted-room modal with 확인 (screens.md S3 방이 삭제됨)', () => {
    expect(html(4001)).toMatch(/role="alertdialog".*이 방은 삭제됐어요.*<button[^>]*>확인<\/button>/);
  });

  it.each([4008, 1003, 1009])('%i says the connection ended and offers a reload', (code) => {
    expect(html(code)).toMatch(/연결이 끊겼어요.*<button[^>]*>새로고침<\/button>/);
  });
});
