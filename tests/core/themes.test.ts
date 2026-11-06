import { describe, expect, it } from 'vitest';
import { THEMES, THEME_IDS, type Vec3 } from '../../src/core/themes.ts';

const inside = (p: Vec3, { min, max }: { min: Vec3; max: Vec3 }) => p.every((v, i) => v >= min[i] && v <= max[i]);

describe('themes', () => {
  it('has three themes with unique ids', () => {
    expect(THEME_IDS).toHaveLength(3);
    expect(new Set(THEME_IDS).size).toBe(3);
    expect(THEME_IDS).toContain('cafe');
    expect(Object.keys(THEMES).sort()).toEqual([...THEME_IDS].sort());
  });

  it.each(THEME_IDS)('%s: spawn and default objects are inside the bounds, object ids unique', (id) => {
    const theme = THEMES[id];
    expect(theme.id).toBe(id);
    expect(theme.nameKey).toBe(`theme.${id}`);
    expect(inside(theme.spawn, theme.bounds)).toBe(true);
    expect(theme.defaultObjects.length).toBeGreaterThan(0);
    for (const o of theme.defaultObjects) expect(inside(o.position, theme.bounds), o.id).toBe(true);
    expect(new Set(theme.defaultObjects.map((o) => o.id)).size).toBe(theme.defaultObjects.length);
  });
});
