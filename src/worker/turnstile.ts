// T063: Cloudflare Turnstile siteverify. No remoteip: the client IP stays inside the rate limiter (constitution II).
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(secret: string, token: string): Promise<boolean> {
  const res = await fetch(SITEVERIFY, { method: 'POST', body: new URLSearchParams({ secret, response: token }) });
  if (!res.ok) throw new Error(`siteverify ${res.status}`);
  return (await res.json<{ success: boolean }>()).success === true;
}
