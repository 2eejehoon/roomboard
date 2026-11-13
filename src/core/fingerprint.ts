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
const isVendor = (file: string) => file.includes('node_modules') || /(^|\/)vendor[-.]/.test(file);

/** research R4: SHA-256(name + top 3 app frames as "file:fn"), first 16 hex chars. Line/col and build hash left out on purpose. */
export async function fingerprint(errorName: string, frames: Frame[], sha256: Sha256): Promise<string> {
  const key = [errorName, ...frames.filter((f) => !isVendor(f.file)).slice(0, 3).map((f) => `${withoutBuildHash(f.file)}:${f.fn}`)].join('\n');
  const hash = new Uint8Array(await sha256(key));
  return Array.from(hash.subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}
