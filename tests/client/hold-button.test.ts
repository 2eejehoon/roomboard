// PR #88 review: a held button (guard, smash) must end however the press ends: release off the button, a touch cancel, a lost
// capture. holdHandlers captures the pointer on press and ends on lostpointercapture, which all of those fire.
import { describe, expect, it, vi } from 'vitest';
import { holdHandlers } from '../../src/client/room/room2d/ArenaSide.tsx';

const press = () => ({ pointerId: 7, currentTarget: { setPointerCapture: vi.fn() } }) as unknown as Parameters<ReturnType<typeof holdHandlers>['onPointerDown']>[0];

describe('holdHandlers', () => {
  it('captures the pointer on press and ends once when the capture is lost (release anywhere, or a cancel)', () => {
    const [down, up] = [vi.fn(), vi.fn()];
    const h = holdHandlers(down, up);
    const e = press();
    h.onPointerDown(e);
    expect(down).toHaveBeenCalledTimes(1);
    expect((e.currentTarget as unknown as { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture).toHaveBeenCalledWith(7);
    h.onLostPointerCapture();
    expect(up).toHaveBeenCalledTimes(1);
  });
});
