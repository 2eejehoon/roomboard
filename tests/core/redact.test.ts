import { describe, expect, it } from 'vitest';
import { redact } from '../../src/core/redact.ts';

const M = '[가림]';

describe('redact', () => {
  it.each([
    ['email', 'send to a.b+c@example.co.kr failed'],
    ['korean mobile', 'call 010-1234-5678 now'],
    ['korean mobile no dashes', 'call 01012345678 now'],
    ['korean landline', 'call 02-123-4567 now'],
    ['korean mobile with spaces', 'call 010 1234 5678 now'],
    ['korean mobile with dots', 'call 010.1234.5678 now'],
    ['international', 'call +82 10 1234 5678 now'],
    ['ipv4', 'from 192.168.0.1 port'],
    ['ipv6', 'from 2001:db8:85a3::8a2e:370:7334 port'],
    ['ipv6 loopback', 'from ::1 port'],
    ['ipv6 mapped', 'from ::ffff:c0a8:1 port'],
    ['ipv6 full', 'from 2001:0db8:0000:0000:0000:ff00:0042:8329 port'],
    ['uuid', 'room 3f2b8c1e-9a4d-4e2f-8b1a-0c9d8e7f6a5b gone'],
    ['hex token', `key ${'a1'.repeat(16)} bad`],
    ['base64 token', `key ${'Ab9+/'.repeat(7)}== bad`],
    ['double quotes', 'Unexpected token in "내 비밀 메모" here'],
    ['single quotes', "Cannot read 'hello world' here"],
  ])('masks %s', (_, input) => {
    const out = redact(input);
    expect(out).toContain(M);
    expect(out.split(' ')[0]).toBe(input.split(' ')[0]);
  });

  it('masks nested quotes as one span (V8 JSON.parse echoes the input)', () => {
    const out = redact(`Unexpected token 'o', "{"note":"my secret memo","x":1 oops}" is not valid JSON`);
    expect(out).not.toMatch(/note|secret|memo/);
    expect(out).toMatch(/^Unexpected token .* is not valid JSON$/);
  });

  it('keeps long paths without digits (tokens almost always have one)', () => {
    const s = 'Failed to fetch /api/rooms/some-room-name/messages-list';
    expect(redact(s)).toBe(s);
  });

  it('masks quoted text across lines, and an unclosed quote to the end', () => {
    expect(redact('Unexpected token \'m\', "{\n  my secret memo\n}" is not valid JSON')).not.toMatch(/secret/);
    expect(redact('Unterminated string "my secret\nmemo')).toBe('Unterminated string [가림]');
  });

  it("keeps apostrophes inside words (Safari: Can't find variable)", () => {
    expect(redact("ReferenceError: Can't find variable: foo")).toBe("ReferenceError: Can't find variable: foo");
  });

  it('leaves no octet of an IPv4 embedded in IPv6', () => {
    for (const ip of ['::ffff:192.168.0.1', '2001:db8::192.168.0.1']) expect(redact(`from ${ip} port`)).not.toMatch(/\d/);
  });

  it('masks every match, not just the first', () => {
    expect(redact('a@b.com and c@d.com')).toBe(`${M} and ${M}`);
  });

  it('keeps ordinary error text unchanged', () => {
    for (const s of [
      'TypeError: Cannot read properties of undefined (reading x)',
      'RangeError: Maximum call stack size exceeded',
      'NetworkError when attempting to fetch resource.',
      'at RoomPage (assets/index-3f2b8c1e.js:12:345)',
      'version 1.2.3 build 2026-11-12 at 12:34:56',
      'Failed to fetch https://roomboard.example.dev/assets/RoomPage-a1b2c3.js',
    ]) {
      expect(redact(s)).toBe(s);
    }
  });
});
