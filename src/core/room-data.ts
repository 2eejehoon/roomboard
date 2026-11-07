// Room data (data-model.md "RoomData"): the room as JSON, interpreted by the renderers.
import { THEMES, type RoomObject, type ThemeId } from './themes.ts';

export type RoomData = { version: 1; themeId: ThemeId; objects: RoomObject[] };

export function createRoomData(themeId: ThemeId): RoomData {
  const objects = THEMES[themeId].defaultObjects.map((o) => ({ ...o, position: [...o.position] as RoomObject['position'] }));
  return { version: 1, themeId, objects };
}

// FR-005: a theme change resets the objects to the new theme's defaults.
export const changeTheme = (_data: RoomData, themeId: ThemeId): RoomData => createRoomData(themeId);
