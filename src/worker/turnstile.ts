// T063: Cloudflare Turnstile siteverify. No remoteip: the client IP stays inside the rate limiter (constitution II).
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Cloudflare's documented test secrets (always pass, always fail) get their documented answer here, so local dev and E2E work
// where workerd cannot reach the network (precedent 2026-11-08-turnstile-test-keys). Every other secret asks siteverify.
const TEST_SECRETS: Record<string, boolean> = { '1x0000000000000000000000000000000AA': true, '2x0000000000000000000000000000000AA': false };

export async function verifyTurnstile(secret: string, token: string): Promise<boolean> {
  if (secret in TEST_SECRETS) return TEST_SECRETS[secret]!;
  const res = await fetch(SITEVERIFY, { method: 'POST', body: new URLSearchParams({ secret, response: token }) });
  if (!res.ok) throw new Error(`siteverify ${res.status}`);
  return (await res.json<{ success: boolean }>()).success === true;
}
