// What the brawl looks like (FR-030a, data-model.md "LOOKS"): screens read colours, models and timings of looks only here.
// Changing these changes no judgement, tuning or unit test.
export const LOOKS = {
  blocks: { dirt: { color: '#8b5e3c' }, stone: { color: '#9a9ea6' } },
  arena: { boundary: '#f2c14e', exit: '#3fb68b', entrance: '#4a90d9' },
  flight: { catchUpMs: 150 },
  swing: { color: '#fff4c2', size: 0.25, durationMs: 120 },
} as const;
