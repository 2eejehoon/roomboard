import { exports } from 'cloudflare:workers';
import { expect, it } from 'vitest';

// Proves the Worker runs inside workerd in tests (001 Setup): unknown API paths use the Error contract (openapi.yaml).
it('unknown /api paths return the not_found error shape', async () => {
  const res = await exports.default.fetch('https://roomboard.test/api/nope');
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ code: 'not_found' });
});
