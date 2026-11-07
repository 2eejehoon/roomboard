// When the 3D scene sends my pose (T045), kept out of the renderer so it is tested without WebGL (constitution IV).
// My input starts the sends; leftover motion (sliding, mid-air) keeps them going, then one idle. Resting physics sends nothing.
import type { Pose } from '../../core/room-session.ts';
import type { Vec3 } from '../../core/themes.ts';

export function nextSend(driving: boolean, wasSending: boolean, [vx, vy, vz]: Vec3): Pose['a'] | null {
  // Thresholds, not zero: ecctrl slows down exponentially and its float spring bobs.
  const speed = Math.hypot(vx, vz);
  const falling = Math.abs(vy) > 0.5;
  if (!driving && !(wasSending && (speed > 0.2 || falling))) return wasSending ? 'idle' : null;
  return falling ? 'jump' : speed > 3 ? 'run' : 'walk';
}

// A store pose I did not send: a correction or a new welcome. The server rejects a move that arrives too soon after the last
// one (validateMove times arrivals), so network jitter can bring a correction a step or two behind me. Snapping back would
// rubber-band me mid-run; the server takes my next move instead, so resend where I am (the rejected move may have been my last).
// Only a far pose (a reconnect at the spawn, a real divergence) moves the body.
const SNAP_M = 3; // a run send covers about 1 m
export const onStorePose = (body: Vec3, target: Vec3): 'snap' | 'resend' =>
  Math.hypot(body[0] - target[0], body[1] - target[1], body[2] - target[2]) > SNAP_M ? 'snap' : 'resend';
