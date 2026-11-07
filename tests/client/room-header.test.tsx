import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RoomHeader } from '../../src/client/room/RoomPage.tsx';
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
