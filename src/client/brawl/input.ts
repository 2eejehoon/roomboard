// Skill input (R2, FR-012, FR-032): keys and buttons turn into brawl messages. The screen shows the swing at once (show) and
// the server's swing confirms it. A jab pressed during the cooldown is held and sent once the server clock passes readyAt.
import type { BrawlMessage } from '../../core/brawl/brawl-session.ts';
import { TUNING } from '../../core/brawl/tuning.ts';

type Deps = { send: (m: BrawlMessage) => void; serverNow: () => number; readyAt: () => number; show: (k: 'jab' | 'smash' | 'throw') => void };

export function createBrawlInput({ send, serverNow, readyAt, show }: Deps) {
  let nonce = 0;
  let held: ReturnType<typeof setTimeout> | undefined;
  // Until my jab's swing brings readyAt, the earliest it can be: the cooldown with no hitstop (a whiff). The estimate reads the
  // server clock late, so this never runs ahead of the server's readyAt.
  let guess = -Infinity;
  const skill = (k: 'jab' | 'smash' | 'throw') => {
    show(k);
    if (k === 'jab') guess = serverNow() + TUNING.skills.jab1.cooldownMs;
    send({ t: 'skill', k, nonce: `s${++nonce}` });
  };
  // The estimate reads the server clock late (R3), so a jab sent at readyAt by it never arrives early.
  const waitThenJab = () => {
    const wait = Math.max(readyAt(), guess) - serverNow();
    if (wait <= 0) {
      held = undefined;
      skill('jab');
    } else held = setTimeout(waitThenJab, wait);
  };
  return {
    press(k: 'jab' | 'smash' | 'throw') {
      if (k === 'smash') send({ t: 'hold', k });
      else if (k === 'throw') skill(k);
      else if (held === undefined) waitThenJab();
    },
    release(k: 'smash') {
      skill(k);
    },
    guard(on: boolean) {
      send({ t: 'guard', on });
    },
    roll(d: [number, number]) {
      send({ t: 'roll', d });
    },
    dispose() {
      clearTimeout(held);
    },
  };
}
export type BrawlInput = ReturnType<typeof createBrawlInput>;
