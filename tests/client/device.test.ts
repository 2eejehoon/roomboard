import { describe, expect, it } from 'vitest';
import { deviceKey, readView, saveView } from '../../src/client/device.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const memoryStorage = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), map: m };
};
const brokenStorage = {
  getItem: (): string | null => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('deviceKey (data-model 기기 localStorage)', () => {
  it('creates a uuid, stores it as rb.deviceKey and returns it again', () => {
    const s = memoryStorage();
    const key = deviceKey(s);
    expect(key).toMatch(UUID);
    expect(s.map.get('rb.deviceKey')).toBe(key);
    expect(deviceKey(s)).toBe(key);
  });

  it('keeps an existing key and replaces one that is not a uuid', () => {
    const existing = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
    expect(deviceKey(memoryStorage({ 'rb.deviceKey': existing }))).toBe(existing);
    const s = memoryStorage({ 'rb.deviceKey': 'garbage' });
    expect(deviceKey(s)).toMatch(UUID);
    expect(s.map.get('rb.deviceKey')).toMatch(UUID);
  });

  it('falls back to one in-memory key when storage throws or is missing', () => {
    const key = deviceKey(brokenStorage);
    expect(key).toMatch(UUID);
    expect(deviceKey(brokenStorage)).toBe(key);
    expect(deviceKey(null)).toBe(key);
  });
});

describe('rb.view', () => {
  it('saves and reads 3d / 2d, ignores other values', () => {
    const s = memoryStorage();
    expect(readView(s)).toBeNull();
    saveView('2d', s);
    expect(s.map.get('rb.view')).toBe('2d');
    expect(readView(s)).toBe('2d');
    expect(readView(memoryStorage({ 'rb.view': 'vr' }))).toBeNull();
  });

  it('does not throw when storage is broken', () => {
    expect(readView(brokenStorage)).toBeNull();
    expect(() => saveView('3d', brokenStorage)).not.toThrow();
  });
});
