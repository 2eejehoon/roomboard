import { describe, expect, it } from 'vitest';
import { ko } from '../../src/client/i18n/ko.ts';
import { t } from '../../src/client/i18n/t.ts';
import { THEMES } from '../../src/core/themes.ts';

describe('t', () => {
  it('returns the Korean text and fills {vars}', () => {
    expect(t('common.retry')).toBe(ko['common.retry']);
    expect(t('common.rateLimited', { seconds: 3 })).toBe('잠시 후 다시 시도해 주세요 (3초)');
  });

  it('every theme nameKey has text', () => {
    for (const theme of Object.values(THEMES)) expect(t(theme.nameKey), theme.id).toMatch(/[가-힣]/);
  });

  it('every zone nameKey has text', () => {
    for (const theme of Object.values(THEMES)) for (const zone of theme.zones) expect(t(zone.nameKey), `${theme.id} ${zone.nameKey}`).toMatch(/[가-힣]/);
  });

  it('an unknown key is a type error', () => {
    // @ts-expect-error not a key of ko.ts
    expect(t('no.such.key')).toBe('no.such.key');
  });
});
