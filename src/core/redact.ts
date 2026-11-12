// research R4: runs on client and Worker before anything is sent, stored or published.
const MASK = '[가림]';
const PATTERNS = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, // email
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, // uuid
  /\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b|\b(?:[0-9a-f]{1,4}:)+:(?:[0-9a-f]{1,4}:?)*[0-9a-f]{0,4}/gi, // ipv6: full, or with ::
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, // ipv4
  /\+\d{1,3}[ -]?\d{1,4}(?:[ -]?\d{3,4}){2}\b/g, // international phone
  /\b0\d{1,2}-?\d{3,4}-?\d{4}\b/g, // korean phone
  /[A-Za-z0-9+/_-]{32,}={0,2}/g, // long hex/base64 token
  /"[^"]*"|'[^']*'|“[^”]*”|‘[^’]*’/g, // quoted text: user content often lands in error messages this way
];

export function redact(text: string): string {
  return PATTERNS.reduce((s, re) => s.replace(re, MASK), text);
}
