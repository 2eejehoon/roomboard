// Themes (data-model.md "Theme"). nameKey is an i18n key in src/client/i18n/ko.ts.

export type Vec3 = [number, number, number];
export type Bounds = { min: Vec3; max: Vec3 };
export type RoomObject = { id: string; assetId: string; position: Vec3; rotationY: number; scale?: number; collider: 'box' | 'none' };

export const THEME_IDS = ['cafe', 'library', 'garden'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
// Rough position for the 2D list (data-model.md Zone): area is [minX, minZ, maxX, maxZ]; the last zone has none and covers the rest.
export type ZoneKey = 'zone.entrance' | 'zone.counter' | 'zone.tables' | 'zone.shelves' | 'zone.desk' | 'zone.well' | 'zone.trees';
export type Zone = { nameKey: ZoneKey; area?: [number, number, number, number] };
// 003 data-model "Theme" look: indoor themes get walls on the bounds, outdoor ones a sky and fog. Colours are #rrggbb.
type Light = { color: string; intensity: number };
export type Look = { floor: string; sky: string; sun: Light & { direction: Vec3 }; ambient: { sky: string; ground: string; intensity: number } } & (
  | { kind: 'indoor'; wall: string }
  | { kind: 'outdoor'; fog: { near: number; far: number } }
);
export type Theme = { id: ThemeId; nameKey: `theme.${ThemeId}`; bounds: Bounds; spawn: Vec3; defaultObjects: RoomObject[]; zones: Zone[]; look: Look };

// scale brings each model to room size (public/assets/CREDITS.md lists the sources).
const box = (id: string, assetId: string, position: Vec3, rotationY = 0, scale?: number): RoomObject => ({ id, assetId, position, rotationY, collider: 'box', ...(scale && { scale }) });

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
    look: {
      kind: 'indoor',
      floor: '#a7825e',
      wall: '#efe0c8',
      sky: '#3b2f28',
      sun: { color: '#ffd9a8', intensity: 2.2, direction: [-0.5, -1, -0.4] },
      ambient: { sky: '#fff1dc', ground: '#6b4a32', intensity: 2.2 },
    },
  },
  library: {
    id: 'library',
    nameKey: 'theme.library',
    bounds: { min: [-8, 0, -8], max: [8, 4, 8] },
    spawn: [0, 0, 6],
    defaultObjects: [
      box('shelf-1', 'bookshelf', [-7, 0, -4], Math.PI / 2, 0.7),
      box('shelf-2', 'bookshelf', [-7, 0, 0], Math.PI / 2, 0.7),
      box('shelf-3', 'bookshelf', [7, 0, -4], -Math.PI / 2, 0.7),
      box('desk', 'desk', [0, 0, -3]),
      box('sofa', 'sofa', [4, 0, 3], -Math.PI / 2, 0.6),
      { id: 'lamp', assetId: 'lamp', position: [0, 0, -6], rotationY: 0, collider: 'none' },
    ],
    zones: [
      { nameKey: 'zone.entrance', area: [-8, 4, 8, 8] },
      { nameKey: 'zone.shelves', area: [-8, -8, -5, 4] },
      { nameKey: 'zone.shelves', area: [5, -8, 8, 4] },
      { nameKey: 'zone.desk' },
    ],
    look: {
      kind: 'indoor',
      floor: '#6e5a48',
      wall: '#d8d2c2',
      sky: '#24262b',
      sun: { color: '#fff3dd', intensity: 1.8, direction: [0.4, -1, -0.3] },
      ambient: { sky: '#e6ecf5', ground: '#4a3d33', intensity: 2 },
    },
  },
  garden: {
    id: 'garden',
    nameKey: 'theme.garden',
    bounds: { min: [-10, 0, -10], max: [10, 4, 10] },
    spawn: [0, 0, 8],
    defaultObjects: [
      box('well', 'well', [0, 0, 0], 0, 2),
      box('tree-1', 'tree', [-6, 0, -6], 0, 2),
      box('tree-2', 'tree', [6, 0, -6], 0, 2),
      box('bench-1', 'bench', [-4, 0, 3], Math.PI / 4, 2.5),
      box('bench-2', 'bench', [4, 0, 3], -Math.PI / 4, 2.5),
      { id: 'flowers', assetId: 'flowers', position: [0, 0, -8], rotationY: 0, scale: 1.5, collider: 'none' },
    ],
    zones: [{ nameKey: 'zone.entrance', area: [-10, 6, 10, 10] }, { nameKey: 'zone.well', area: [-3, -3, 3, 3] }, { nameKey: 'zone.trees' }],
    look: {
      kind: 'outdoor',
      floor: '#7fae5a',
      sky: '#bfe3f5',
      sun: { color: '#fffaf0', intensity: 2.6, direction: [-0.6, -1, -0.5] },
      ambient: { sky: '#cfeaff', ground: '#5c7a3a', intensity: 2.2 },
      fog: { near: 18, far: 45 },
    },
  },
};

export const zoneAt = (themeId: ThemeId, [x, , z]: Vec3): ZoneKey =>
  THEMES[themeId].zones.find(({ area: a }) => !a || (x >= a[0] && z >= a[1] && x <= a[2] && z <= a[3]))!.nameKey;
