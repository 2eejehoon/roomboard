import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Constitution IV (core stays renderer/runtime free) and i18n (no hard-coded UI text) are enforced by lint rules.
const eslint = new ESLint();
const lint = async (filePath: string, code: string) => (await eslint.lintText(code, { filePath }))[0].messages.map((m) => m.message);

describe('eslint boundary rules', () => {
  it('src/core may not import renderers, frameworks or Workers APIs', async () => {
    for (const mod of ['react', 'three', '@react-three/fiber', 'ecctrl', 'hono', 'cloudflare:workers']) {
      const msgs = await lint('src/core/x.ts', `import '${mod}';\n`);
      expect(msgs.join('\n'), mod).toMatch(/src\/core/);
    }
  });

  it('src/core may not use DOM globals', async () => {
    const msgs = await lint('src/core/x.ts', 'export const w = window.innerWidth;\n');
    expect(msgs.join('\n')).toMatch(/src\/core/);
  });

  it('src/core may import other core modules', async () => {
    expect(await lint('src/core/x.ts', "import { shouldRunAgent } from './agent-gate.ts';\nexport const f = shouldRunAgent;\n")).toEqual([]);
  });

  it('client JSX may not contain Korean text', async () => {
    const msgs = await lint('src/client/x.tsx', 'export const A = () => <p>안녕하세요</p>;\n');
    expect(msgs.join('\n')).toMatch(/t\(/);
    const attr = await lint('src/client/x.tsx', 'export const B = () => <input placeholder="닉네임" />;\n');
    expect(attr.join('\n')).toMatch(/t\(/);
    const expr = await lint('src/client/x.tsx', "export const C = () => <p>{'안녕하세요'}</p>;\n");
    expect(expr.join('\n')).toMatch(/t\(/);
  });

  it('client JSX may use t() and non-Korean literals', async () => {
    expect(await lint('src/client/x.tsx', "declare const t: (k: string) => string;\nexport const A = () => <p className=\"x\">{t('greeting')}</p>;\n")).toEqual([]);
  });
});
