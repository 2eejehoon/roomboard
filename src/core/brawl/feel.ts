// The % colour over a fighter (FR-022). A look only: it changes no judgement (FR-024).
import type { Tuning } from './tuning.ts';

export type DamageColor = 'white' | 'yellow' | 'red';

export const damageColor = (damage: number, t: Tuning): DamageColor =>
  damage >= t.damageColor.redFrom ? 'red' : damage >= t.damageColor.yellowFrom ? 'yellow' : 'white';
