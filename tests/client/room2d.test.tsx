import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RoomHeader } from '../../src/client/room/RoomPage.tsx';
import { Room2D } from '../../src/client/room/room2d/Room2D.tsx';
import { RoomStore } from '../../src/client/state/room-store.ts';
import { createRoomData } from '../../src/core/room-data.ts';

// T054: screens.md S3 2D.
const room = { id: 'seedroom01', title: '시드 방', description: '개발·E2E용 방', roomData: createRoomData('cafe') };

function store() {
  const s = new RoomStore();
  s.apply({
    t: 'welcome',
    v: 1,
    you: { peerId: 'me', nickname: '느긋한 수달', avatarId: 'char-03' },
    channel: 2,
    room,
    peers: [{ peerId: 'a', nickname: '용감한 여우', avatarId: 'char-01', p: [0, 0, -5], r: 0, a: 'walk' }],
    spawn: [0, 0, 4],
  });
  return s;
}

describe('Room2D (screens.md S3 2D)', () => {
  it('shows the title as h1, the description, theme and channel', () => {
    const html = renderToStaticMarkup(<Room2D room={room} state={store().getState()} />);
    expect(html).toContain('<h1>시드 방</h1>');
    expect(html).toContain('개발·E2E용 방');
    expect(html).toContain('카페');
    expect(html).toContain('채널 2');
  });

  it('lists me and every peer with status and zone', () => {
    const html = renderToStaticMarkup(<Room2D room={room} state={store().getState()} />);
    const items = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatch(/느긋한 수달.*\(나\).*가만히.*입구 근처/);
    expect(items[1]).toMatch(/용감한 여우.*걷는 중.*카운터 앞/);
  });

  it('reads joins and leaves in a live region that is there before the first notice', () => {
    const s = store();
    expect(renderToStaticMarkup(<Room2D room={room} state={s.getState()} />)).toMatch(/aria-live="polite"/);
    s.apply({ t: 'peer_left', peerId: 'a' });
    expect(renderToStaticMarkup(<Room2D room={room} state={s.getState()} />)).toMatch(/aria-live="polite"[^>]*>.*용감한 여우 님이 나갔어요/);
  });
});

describe('RoomHeader view switch (T056)', () => {
  it('offers the other view when the switch is given, and nothing without WebGL', () => {
    const state = store().getState();
    expect(renderToStaticMarkup(<RoomHeader title="시드 방" state={state} view="3d" onSwitch={() => {}} />)).toMatch(/<button[^>]*>2D로 보기<\/button>/);
    expect(renderToStaticMarkup(<RoomHeader title="시드 방" state={state} view="2d" onSwitch={() => {}} />)).toMatch(/<button[^>]*>3D로 보기<\/button>/);
    expect(renderToStaticMarkup(<RoomHeader title="시드 방" state={state} view="2d" />)).not.toContain('<button');
  });
});
