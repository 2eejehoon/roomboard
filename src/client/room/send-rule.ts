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
