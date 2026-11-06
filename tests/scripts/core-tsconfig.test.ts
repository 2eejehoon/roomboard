import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';

// Constitution IV: src/core is checked with no DOM, Node or Workers types, so a runtime API in core is a type error.
const config = ts.getParsedCommandLineOfConfigFile('tsconfig.core.json', {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const dir = mkdtempSync(join(tmpdir(), 'core-tsconfig-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const errors = (code: string) => {
  const file = join(dir, `${Math.random().toString(36).slice(2)}.ts`);
  writeFileSync(file, `${code}\nexport {};\n`);
  const program = ts.createProgram([file], config!.options);
  return ts.getPreEmitDiagnostics(program).filter((d) => d.file?.fileName === file).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
};

describe('tsconfig.core.json', () => {
  it('covers src/core only', () => {
    expect(config!.errors).toEqual([]);
    expect(config!.fileNames.length).toBeGreaterThan(0);
    expect(config!.fileNames.every((f) => f.includes('/src/core/'))).toBe(true);
  });

  it.each([
    ['DOM', 'window.innerWidth;'],
    ['DOM', 'document.title;'],
    ['DOM/Workers', 'new TextEncoder();'],
    ['DOM/Workers', 'crypto.subtle;'],
    ['DOM/Workers', 'setTimeout(() => 0, 1);'],
    ['DOM/Workers', 'console.log(1);'],
    ['Node', 'process.env;'],
    ['Node', 'Buffer.from("a");'],
    ['Workers', 'new WebSocketPair();'],
  ])('%s global is a type error: %s', (_, code) => {
    expect(errors(code).join('\n')).toMatch(/Cannot find name/);
  });

  it('plain ES2022 code type-checks', () => {
    expect(errors('const m = new Map<string, number>(); m.set("a", Math.imul(2, 3)); JSON.stringify([..."가나"]);')).toEqual([]);
  });
});
