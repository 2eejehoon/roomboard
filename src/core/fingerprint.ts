export interface Frame {
  file: string;
  fn: string;
  line: number;
  col: number;
}

/** SHA-256 of UTF-8 text. Core holds no crypto; client and Worker pass `crypto.subtle`. */
export type Sha256 = (text: string) => Promise<ArrayBuffer>;

// Vite names chunks "<name>-<8 char hash>.js"; the hash changes on every build that touches the chunk.
const withoutBuildHash = (file: string) => file.replace(/-[\w-]{8}(?=\.m?js$)/, '');
export const isVendor = (file: string) => file.includes('node_modules') || /(^|\/)vendor[-.]/.test(file);

/** research R4: SHA-256(name + top 3 app frames as "file:fn"), first 16 hex chars. Line/col and build hash left out on purpose. */
export async function fingerprint(errorName: string, frames: Frame[], sha256: Sha256): Promise<string> {
  const key = [errorName, ...frames.filter((f) => !isVendor(f.file)).slice(0, 3).map((f) => `${withoutBuildHash(f.file)}:${f.fn}`)].join('\n');
  const hash = new Uint8Array(await sha256(key));
  return Array.from(hash.subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

// The last path piece only: origin, path, query and hash can carry personal data or tokens (research R4).
export const fileName = (file: string) => file.split(/[?#]/)[0]!.split('/').pop()!;

// V8 "    at [async] fn (file:line:col)" or "    at file:line:col"; Firefox and Safari "fn@file:line:col" or "@file:line:col".
const V8_LINE = /^\s*at (?:async )?(?:(.*?) \()?(.*?):(\d+):(\d+)\)?$/;
const GECKO_LINE = /^(?:(.*?)@)?(.*?):(\d+):(\d+)$/;

/** research R4. V8 opens the stack with "<name>: <message>" (the name at throw time, which a subclass may change later); those
 * lines are skipped, since a message can echo input that looks like a frame. Firefox and Safari have no such header. */
export function parseStack(err: { message: string; stack?: string }): Frame[] {
  const stack = err.stack ?? '';
  const at = err.message ? stack.indexOf(`: ${err.message}`) : -1;
  const header = at >= 0 && !stack.slice(0, at).includes('\n') ? err.message.split('\n').length : 0;
  return stack
    .split('\n')
    .slice(header)
    .flatMap((line) => {
      const m = V8_LINE.exec(line) ?? GECKO_LINE.exec(line);
      return m ? [{ file: m[2]!, fn: m[1] ?? '', line: Number(m[3]), col: Number(m[4]) }] : [];
    });
}
