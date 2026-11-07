import { describe, expect, it } from 'vitest';
import { nextSend, onStorePose } from '../../src/client/room/send-rule.ts';

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

// A store pose I did not send (a correction, a new welcome). A jitter correction is a step or two behind me: keep my body and
// resend where I am, since it may have been my last move and nothing else would correct the server and the peers.
describe('onStorePose', () => {
  it('resends my pose for a correction a few run steps behind', () => {
    expect(onStorePose([0, 0, 4], [0, 0, 2])).toBe('resend');
  });

  it('moves the body when the store pose is far away, like a reconnect at the spawn', () => {
    expect(onStorePose([5, 0, -5], [0, 0, 4])).toBe('snap');
  });
});
