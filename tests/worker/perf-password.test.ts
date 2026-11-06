import { expect, it } from 'vitest';

// T011 / research R5: CPU time of one PBKDF2-SHA256 100,000-iteration hash inside workerd. Local workerd timers advance during
// CPU work (no Spectre clamping), so this is a proxy for edge CPU time on the same class of machine, not the edge number itself.
const ITERATIONS = 100_000;

it('PBKDF2-SHA256 100,000 iterations runs in workerd; prints the median time', async () => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('seed-pass'), 'PBKDF2', false, ['deriveBits']);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const times: number[] = [];
  for (let i = 0; i < 7; i++) {
    const start = performance.now();
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
    times.push(performance.now() - start);
    expect(bits.byteLength).toBe(32);
  }
  const median = times.sort((a, b) => a - b)[3];
  console.log(`perf-password: PBKDF2 ${ITERATIONS} iterations median ${median} ms (runs: ${times.join(', ')})`);
  expect(median, 'timer must advance or the number means nothing').toBeGreaterThan(0);
});
