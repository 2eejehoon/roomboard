import { ko } from './ko.ts';

export const LOCALE = 'ko'; // Intl formats (relative time) follow the one language v1 ships

export type I18nKey = keyof typeof ko;

export const t = (key: I18nKey, vars: Record<string, string | number> = {}): string =>
  (ko[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
