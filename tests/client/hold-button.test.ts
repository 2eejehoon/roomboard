// PR #88 review: a held 2D button (guard, smash) must end however the press ends. The press captures the pointer, so a release
// off the button, a touch cancel or any other loss fires lostpointercapture on the button, which ends the hold.
import { describe, expect, it, vi } from 'vitest';
import { capture } from '../../src/client/room/room2d/ArenaSide.tsx';

describe('held 2D buttons', () => {
  it('capture() takes the pointer on press', () => {
    const setPointerCapture = vi.fn();
    capture({ pointerId: 7, currentTarget: { setPointerCapture } } as unknown as Parameters<typeof capture>[0]);
    expect(setPointerCapture).toHaveBeenCalledWith(7);
  });
});
