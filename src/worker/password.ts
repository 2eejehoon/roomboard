// research R5: PBKDF2-SHA256 in the room's DO (Worker CPU limit). Stored as pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>,
// the format scripts/seed-dev.ts writes with Node.
const ITERATIONS = 100_000;
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt, ITERATIONS))}`;
}

// A stored string in another format is a mismatch, not an error.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split('$');
  const iterations = Number(iter);
  if (scheme !== 'pbkdf2-sha256' || !Number.isSafeInteger(iterations) || iterations < 1 || !salt || !hash) return false;
  let expected: Uint8Array, saltBytes: Uint8Array;
  try {
    [expected, saltBytes] = [unb64(hash), unb64(salt)];
  } catch {
    return false; // atob: not base64
  }
  const actual = await derive(password, saltBytes, iterations);
  return actual.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(actual, expected);
}
