import { describe, expect, it } from 'vitest';
import { nextSend } from '../../src/client/room/send-rule.ts';

// When the 3D scene sends my pose and with which anim (T045). null = send nothing this frame.
describe('nextSend', () => {
  it('sends nothing for physics at rest or settling, even when it bobs up and down', () => {
    expect(nextSend(false, false, [0, 0, 0])).toBe(null);
    expect(nextSend(false, false, [0.1, 2, 0])).toBe(null);
  });

  it('sends walk, run or jump while I drive the body', () => {
    expect(nextSend(true, false, [0, 0, 0])).toBe('walk');
    expect(nextSend(true, true, [3, 0, 2])).toBe('run');
    expect(nextSend(true, true, [1, 4, 0])).toBe('jump');
  });

  it('keeps sending leftover motion after I let go, then one idle', () => {
    expect(nextSend(false, true, [0.5, 0, 0])).toBe('walk');
    expect(nextSend(false, true, [0, -3, 0])).toBe('jump');
    expect(nextSend(false, true, [0.1, 0.2, 0])).toBe('idle');
  });
});
