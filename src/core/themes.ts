// Themes (data-model.md "Theme"). nameKey is an i18n key in src/client/i18n/ko.ts.

export type Vec3 = [number, number, number];
export type Bounds = { min: Vec3; max: Vec3 };
export type RoomObject = { id: string; assetId: string; position: Vec3; rotationY: number; scale?: number; collider: 'box' | 'none' };

export const THEME_IDS = ['cafe', 'library', 'garden'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
// Rough position for the 2D list (data-model.md Zone): area is [minX, minZ, maxX, maxZ]; the last zone has none and covers the rest.
export type ZoneKey = 'zone.entrance' | 'zone.counter' | 'zone.tables' | 'zone.shelves' | 'zone.desk' | 'zone.fountain' | 'zone.trees';
export type Zone = { nameKey: ZoneKey; area?: [number, number, number, number] };
export type Theme = { id: ThemeId; nameKey: `theme.${ThemeId}`; bounds: Bounds; spawn: Vec3; defaultObjects: RoomObject[]; zones: Zone[] };

const box = (id: string, assetId: string, position: Vec3, rotationY = 0): RoomObject => ({ id, assetId, position, rotationY, collider: 'box' });

export const THEMES: Readonly<Record<ThemeId, Theme>> = {
  cafe: {
    id: 'cafe',
    nameKey: 'theme.cafe',
    bounds: { min: [-6, 0, -6], max: [6, 4, 6] },
    spawn: [0, 0, 4],
    defaultObjects: [
      box('counter', 'counter', [0, 0, -5]),
      box('table-1', 'table-round', [-3, 0, -1]),
      box('table-2', 'table-round', [3, 0, -1]),
      box('chair-1', 'chair', [-3, 0, 0], Math.PI),
      box('chair-2', 'chair', [3, 0, 0], Math.PI),
      { id: 'plant', assetId: 'plant', position: [5, 0, 5], rotationY: 0, collider: 'none' },
    ],
    zones: [{ nameKey: 'zone.entrance', area: [-6, 2, 6, 6] }, { nameKey: 'zone.counter', area: [-6, -6, 6, -3] }, { nameKey: 'zone.tables' }],
  },
  library: {
    id: 'library',
    nameKey: 'theme.library',
    bounds: { min: [-8, 0, -8], max: [8, 4, 8] },
    spawn: [0, 0, 6],
    defaultObjects: [
      box('shelf-1', 'bookshelf', [-7, 0, -4], Math.PI / 2),
      box('shelf-2', 'bookshelf', [-7, 0, 0], Math.PI / 2),
      box('shelf-3', 'bookshelf', [7, 0, -4], -Math.PI / 2),
      box('desk', 'desk', [0, 0, -3]),
      box('sofa', 'sofa', [4, 0, 3], -Math.PI / 2),
      { id: 'lamp', assetId: 'lamp', position: [0, 0, -6], rotationY: 0, collider: 'none' },
    ],
    zones: [
      { nameKey: 'zone.entrance', area: [-8, 4, 8, 8] },
      { nameKey: 'zone.shelves', area: [-8, -8, -5, 4] },
      { nameKey: 'zone.shelves', area: [5, -8, 8, 4] },
      { nameKey: 'zone.desk' },
    ],
  },
  garden: {
    id: 'garden',
    nameKey: 'theme.garden',
    bounds: { min: [-10, 0, -10], max: [10, 4, 10] },
    spawn: [0, 0, 8],
    defaultObjects: [
      box('fountain', 'fountain', [0, 0, 0]),
      box('tree-1', 'tree', [-6, 0, -6]),
      box('tree-2', 'tree', [6, 0, -6]),
      box('bench-1', 'bench', [-4, 0, 3], Math.PI / 4),
      box('bench-2', 'bench', [4, 0, 3], -Math.PI / 4),
      { id: 'flowers', assetId: 'flowers', position: [0, 0, -8], rotationY: 0, collider: 'none' },
    ],
    zones: [{ nameKey: 'zone.entrance', area: [-10, 6, 10, 10] }, { nameKey: 'zone.fountain', area: [-3, -3, 3, 3] }, { nameKey: 'zone.trees' }],
  },
};

export const zoneAt = (themeId: ThemeId, [x, , z]: Vec3): ZoneKey =>
  THEMES[themeId].zones.find(({ area: a }) => !a || (x >= a[0] && z >= a[1] && x <= a[2] && z <= a[3]))!.nameKey;
