import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/worker/password.ts';

// T060 / research R5: pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>.
// Made by Node pbkdf2Sync('seed-pass', 'roomboard-salt16', 100000, 32, 'sha256'), the way scripts/seed-dev.ts hashes.
const FROM_NODE = 'pbkdf2-sha256$100000$cm9vbWJvYXJkLXNhbHQxNg==$m2N5napAs/2lSmjdLD8D5Od8GBduNcOF9qpmoihbBz4=';

describe('password', () => {
  it('hash and verify round trip; a wrong password fails', async () => {
    const hash = await hashPassword('pass1234');
    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$/); // 16-byte salt, 32-byte hash
    expect(await verifyPassword('pass1234', hash)).toBe(true);
    expect(await verifyPassword('pass1235', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('pass1234')).not.toBe(await hashPassword('pass1234'));
  });

  it('verifies the stored format that seed-dev writes with Node', async () => {
    expect(await verifyPassword('seed-pass', FROM_NODE)).toBe(true);
    expect(await verifyPassword('seed-pas', FROM_NODE)).toBe(false);
  });

  it('reads the iteration count from the stored string', async () => {
    // Same salt, 1,000 iterations (Node pbkdf2Sync).
    const fewer = 'pbkdf2-sha256$1000$cm9vbWJvYXJkLXNhbHQxNg==$HJt3B7JmjnpxyARLWsirSu7P9TQ9DxsSlBkb8qvRICY=';
    expect(await verifyPassword('seed-pass', fewer)).toBe(true);
  });

  it.each([
    '',
    'x',
    'bcrypt$100000$cm9vbWJvYXJkLXNhbHQxNg==$m2N5napAs/2lSmjdLD8D5Od8GBduNcOF9qpmoihbBz4=',
    'pbkdf2-sha256$abc$cm9vbWJvYXJkLXNhbHQxNg==$m2N5napAs/2lSmjdLD8D5Od8GBduNcOF9qpmoihbBz4=',
    'pbkdf2-sha256$0$cm9vbWJvYXJkLXNhbHQxNg==$m2N5napAs/2lSmjdLD8D5Od8GBduNcOF9qpmoihbBz4=',
    'pbkdf2-sha256$100000$cm9vbWJvYXJkLXNhbHQxNg==$m2N5',
    'pbkdf2-sha256$100000$!!!$m2N5napAs/2lSmjdLD8D5Od8GBduNcOF9qpmoihbBz4=',
  ])('a malformed stored hash %j fails instead of throwing', async (stored) => {
    expect(await verifyPassword('seed-pass', stored)).toBe(false);
  });
});
