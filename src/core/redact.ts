// research R4: runs on client and Worker before anything is sent, stored or published. Never applied to frames[].file
// (fingerprint and the R5 manifest check need real file names; the Worker strips query and hash from those instead).
const MASK = '[가림]';
const H = '[0-9a-f]{1,4}';
const PATTERNS: [RegExp, ((m: string) => string)?][] = [
  // Quoted text, greedy to the last closing quote, across lines (V8 JSON.parse echoes the input, nested quotes and newlines
  // included); with no closing quote, to the end. A ' right after a letter is an apostrophe (Can't), not an opening quote.
  [/"[\s\S]*"|"[\s\S]*|(?<![A-Za-z])'[\s\S]*'|(?<![A-Za-z])'[\s\S]*|“[\s\S]*”|“[\s\S]*|‘[\s\S]*’|‘[\s\S]*/g],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g], // email
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi], // uuid
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g], // ipv4, before ipv6 so an embedded ::ffff:a.b.c.d loses every octet
  // ipv6, full or with ::. Starts anywhere but inside a group (so ip:2001:db8::1 too); each group ends at exactly one ':',
  // which keeps backtracking linear (ReDoS).
  [new RegExp(`(?<![0-9a-f])(?<![0-9a-f:]:)(?:(?:${H}:){7}${H}|(?:(?:${H}:)+|:):(?:${H}(?::${H})*)?)(?![\\w:])`, 'gi')],
  [/\+\d{1,3}[ -]?\d{1,4}(?:[ -]?\d{3,4}){2}\b/g], // international phone
  [/\b0\d{1,2}[-. ]?\d{3,4}[-. ]?\d{4}\b/g], // korean phone
  // Long hex/base64 token. Only with a digit: long digit-free paths survive, and random 32+ char tokens almost never lack one.
  [/[A-Za-z0-9+/_-]{32,}={0,2}/g, (m) => (/\d/.test(m) ? MASK : m)],
];

export function redact(text: string): string {
  return PATTERNS.reduce((s, [re, fn = () => MASK]) => s.replace(re, fn), text);
}
