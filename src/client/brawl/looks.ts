// What the brawl looks like (FR-030a, data-model.md "LOOKS"): screens read colours, models and timings of looks only here.
// Changing these changes no judgement, tuning or unit test.
export const LOOKS = {
  blocks: { dirt: { color: '#8b5e3c' }, stone: { color: '#9a9ea6' } },
  arena: { boundary: '#f2c14e', exit: '#3fb68b', entrance: '#4a90d9' },
  flight: { catchUpMs: 150 },
  swing: { color: '#fff4c2', size: 0.25, durationMs: 120 },
  trail: { width: 4, color: '#ffd166' },
  // Readable on the label's dark chip over any sky, and on the 2D side view's dark background.
  damageText: { background: 'rgba(0,0,0,0.75)', colors: { white: '#ffffff', yellow: '#ffd60a', red: '#ff8a8a' } },
  shake: { strengthFrom: 20, amplitude: 0.15, durationMs: 200 },
} as const;
