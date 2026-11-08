import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES, THEME_IDS, zoneAt, type Vec3 } from '../../src/core/themes.ts';

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

// T055: rough position for the 2D list (data-model.md Zone, screens.md S3 2D).
describe('zoneAt', () => {
  it.each(THEME_IDS)('%s: the spawn is near the entrance, and only the last zone covers the rest', (id) => {
    expect(zoneAt(id, THEMES[id].spawn)).toBe('zone.entrance');
    const zones = THEMES[id].zones;
    expect(zones.at(-1)!.area).toBeUndefined();
    expect(zones.slice(0, -1).every((z) => z.area)).toBe(true);
  });

  it.each(THEME_IDS)('%s: every zone holds some point of the floor', (id) => {
    const { min, max } = THEMES[id].bounds;
    const seen = new Set<string>();
    for (let x = min[0]; x <= max[0]; x++) for (let z = min[2]; z <= max[2]; z++) seen.add(zoneAt(id, [x, 0, z]));
    expect([...seen].sort()).toEqual([...new Set(THEMES[id].zones.map((z) => z.nameKey))].sort());
  });

  it('the first zone that holds the point wins; height does not matter', () => {
    expect(zoneAt('cafe', [0, 0, -5])).toBe('zone.counter');
    expect(zoneAt('cafe', [-3, 0, -1])).toBe('zone.tables');
    expect(zoneAt('cafe', [0, 3, 4])).toBe('zone.entrance');
    expect(zoneAt('library', [-7, 0, -2])).toBe('zone.shelves');
    expect(zoneAt('library', [0, 0, -3])).toBe('zone.desk');
    expect(zoneAt('garden', [0, 0, 0])).toBe('zone.well');
    expect(zoneAt('garden', [-6, 0, -6])).toBe('zone.trees');
  });
});

// T067: the 3D room loads every object's GLB and the theme's HDRI from public/assets; a missing file fails the whole scene.
describe('theme assets', () => {
  it.each(THEME_IDS)('%s has its HDRI and a GLB for every object', (id) => {
    const assets = new URL('../../public/assets/', import.meta.url);
    const files = [`hdri/${id}.hdr`, ...THEMES[id].defaultObjects.map((o) => `models/${o.assetId}.glb`)];
    expect(files.filter((f) => !existsSync(new URL(f, assets)))).toEqual([]);
  });
});
