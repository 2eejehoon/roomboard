import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createChatFilter, parseWordList } from '../../src/core/chat-filter.ts';
import { ADJECTIVES, ANIMALS, AVATAR_IDS, AVATAR_SKINS, avatarFor, nicknameFor } from '../../src/core/identity.ts';

// Deterministic v4-shaped keys so the spread check never flakes.
const keys = Array.from({ length: 1000 }, (_, i) => {
  const h = (i * 2654435761 + 12345).toString(16).padStart(12, '0').slice(-12);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(1, 4)}-8${h.slice(4, 7)}-${h}`;
});

describe('identity', () => {
  it('same key gives the same nickname and avatar', () => {
    for (const k of keys.slice(0, 20)) {
      expect(nicknameFor(k)).toBe(nicknameFor(k));
      expect(avatarFor(k)).toBe(avatarFor(k));
    }
  });

  it('nickname is "<adjective> <animal>" and avatar is from the list', () => {
    const [adj, animal] = nicknameFor(keys[0]).split(' ');
    expect(ADJECTIVES).toContain(adj);
    expect(ANIMALS).toContain(animal);
    for (const k of keys) expect(AVATAR_IDS).toContain(avatarFor(k));
  });

  it('1,000 keys give at least 900 distinct nicknames and use every avatar', () => {
    expect(new Set(keys.map(nicknameFor)).size).toBeGreaterThanOrEqual(900);
    expect(new Set(keys.map(avatarFor)).size).toBe(AVATAR_IDS.length);
  });

  it('no nickname contains a banned word', () => {
    const filter = createChatFilter(parseWordList(readFileSync(new URL('../../src/data/profanity-ko.txt', import.meta.url), 'utf8')));
    expect(new Set(ADJECTIVES).size).toBe(ADJECTIVES.length);
    expect(new Set(ANIMALS).size).toBe(ANIMALS.length);
    const bad = ADJECTIVES.flatMap((a) => ANIMALS.map((b) => `${a} ${b}`)).filter((n) => filter(n) !== n);
    expect(bad).toEqual([]);
  });
});

// 003 research R4: the characters' own skin is near black, so an avatar without an entry here would be black again.
it('every avatar has a skin colour', () => {
  expect(Object.keys(AVATAR_SKINS).sort()).toEqual([...AVATAR_IDS].sort());
  for (const c of Object.values(AVATAR_SKINS)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
});
