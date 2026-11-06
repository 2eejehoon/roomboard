import { describe, expect, it } from 'vitest';
import { changeTheme, createRoomData } from '../../src/core/room-data.ts';
import { THEMES } from '../../src/core/themes.ts';

describe('room data', () => {
  it('createRoomData copies the theme defaults', () => {
    expect(createRoomData('cafe')).toEqual({ version: 1, themeId: 'cafe', objects: THEMES.cafe.defaultObjects });
  });

  it('the copy is independent of the theme', () => {
    const data = createRoomData('cafe');
    data.objects[0].position[0] = 999;
    data.objects.pop();
    expect(THEMES.cafe.defaultObjects[0].position[0]).not.toBe(999);
    expect(createRoomData('cafe').objects).toHaveLength(THEMES.cafe.defaultObjects.length);
  });

  it('changeTheme replaces the objects with the new theme defaults', () => {
    const data = { ...createRoomData('cafe'), objects: [] };
    expect(changeTheme(data, 'library')).toEqual({ version: 1, themeId: 'library', objects: THEMES.library.defaultObjects });
  });
});
