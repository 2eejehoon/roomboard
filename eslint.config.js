// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const CORE = 'src/core is pure room-state logic (constitution IV): move this to src/client or src/worker and pass data in.';
const I18N = "Use t('key') from src/client/i18n instead of hard-coded UI text (constitution: i18n).";
const KOREAN = '/[\\u3131-\\u318E\\uAC00-\\uD7A3]/';

export default tseslint.config(
  { ignores: ['node_modules', 'dist', '.wrangler', 'worker-configuration.d.ts', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
  {
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['react', 'react-*', 'three', '@react-three/*', 'ecctrl', 'ecctrl/*', 'hono', 'hono/*', 'cloudflare:*'], message: CORE }] },
      ],
      'no-restricted-globals': ['error', ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location', 'fetch'].map((name) => ({ name, message: CORE }))],
    },
  },
  {
    files: ['src/client/**/*.tsx'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': [
        'error',
        { selector: `JSXText[value=${KOREAN}]`, message: I18N },
        { selector: `JSXAttribute > Literal[value=${KOREAN}]`, message: I18N },
        { selector: `JSXExpressionContainer > Literal[value=${KOREAN}]`, message: I18N },
      ],
    },
  },
);
