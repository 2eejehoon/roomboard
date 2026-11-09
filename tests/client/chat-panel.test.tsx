import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatPanel } from '../../src/client/room/ChatPanel.tsx';
import { RoomStore } from '../../src/client/state/room-store.ts';
import { createRoomData } from '../../src/core/room-data.ts';

// T073: screens.md S3 채팅 패널 (판례 2026-11-09-chat-panel).
function store() {
  const s = new RoomStore();
  s.apply({ t: 'welcome', v: 1, you: { peerId: 'me', nickname: '느긋한 수달', avatarId: 'char-03' }, channel: 1, room: { id: 'seedroom01', title: '시드 방', description: '', roomData: createRoomData('cafe') }, peers: [], spawn: [0, 0, 4] });
  s.apply({ t: 'chat', messageId: 'm_1', peerId: 'a', nickname: '용감한 여우', text: '<b>안녕</b>', sentAt: 1, channel: 1, sig: 's' });
  return s;
}
const render = (s: RoomStore, view: '2d' | '3d') => renderToStaticMarkup(<ChatPanel roomId="seedroom01" state={s.getState()} send={() => {}} view={view} />);

describe('ChatPanel', () => {
  it('2D reads only the message list aloud and shows nickname and escaped text', () => {
    const html = render(store(), '2d');
    expect(html).toMatch(/<ul aria-live="polite"><li><strong>용감한 여우<\/strong> &lt;b&gt;안녕&lt;\/b&gt; <button[^>]*>신고<\/button><\/li><\/ul>/);
    expect(html.match(/aria-live/g)).toHaveLength(1);
  });

  it('every message has its own report button, named after the sender (T091)', () => {
    expect(render(store(), '2d')).toMatch(/<button type="button" aria-label="용감한 여우 님 메시지 신고">신고<\/button>/);
  });

  it('3D is a details panel without a live region', () => {
    globalThis.matchMedia ??= (() => ({ matches: false })) as never;
    const html = render(store(), '3d');
    expect(html).toMatch(/^<details open/);
    expect(html).not.toContain('aria-live');
  });

  it('turns the input and button off while reconnecting, and shows the wait after rate_limited', () => {
    const s = store();
    const off = (html: string) => ({ input: /<input\b[^>]*aria-disabled="true"/.test(html), button: /<button\b[^>]*\bdisabled=""/.test(html) });
    expect(off(render(s, '2d'))).toEqual({ input: false, button: false });
    s.apply({ t: 'rate_limited', scope: 'chat', retryAfterMs: 1800 });
    s.setConnection('reconnecting');
    const html = render(s, '2d');
    expect(off(html)).toEqual({ input: true, button: true }); // Astryx keeps a disabled input focusable (aria-disabled + readOnly)
    expect(html).toContain('잠시 후 다시 시도해 주세요 (2초)');
  });
});
