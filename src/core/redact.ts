// research R4: runs on client and Worker before anything is sent, stored or published. The Worker applies it to frames[].file
// only after cutting the file down to its name, and only to names outside the deployed build: a real chunk name with a
// 23+ char module name matches the long-token pattern.
const MASK = '[가림]';
const PATTERNS: [RegExp, ((m: string) => string)?][] = [
  // Quoted text, greedy to the last closing quote, across lines (V8 JSON.parse echoes the input, nested quotes and newlines
  // included); with no closing quote, to the end. A ' right after a letter is an apostrophe (Can't), not an opening quote.
  [/"[\s\S]*"|"[\s\S]*|(?<![A-Za-z])'[\s\S]*'|(?<![A-Za-z])'[\s\S]*|“[\s\S]*”|“[\s\S]*|‘[\s\S]*’|‘[\s\S]*/g],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g], // email
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi], // uuid
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g], // ipv4, before ipv6 so an embedded ::ffff:a.b.c.d loses every octet
  // ipv6 (and MAC): any run of hex and colons with '::' or 4+ colons. Broad on purpose: exact IPv6 regexes kept missing
  // forms (ip:…, …: refused) and one backtracked exponentially. Clock times (12:34:56) and file:line:col have 2 colons.
  [/[0-9a-f:]+/gi, (m) => (m.includes('::') || m.split(':').length > 4 ? MASK : m)],
  [/\+\d{1,3}[ -]?\d{1,4}(?:[ -]?\d{3,4}){2}\b/g], // international phone
  [/\b0\d{1,2}[-. ]?\d{3,4}[-. ]?\d{4}\b/g], // korean phone
  // Long hex/base64 token. Only with a digit: long digit-free paths survive, and random 32+ char tokens almost never lack one.
  [/[A-Za-z0-9+/_-]{32,}={0,2}/g, (m) => (/\d/.test(m) ? MASK : m)],
];

export function redact(text: string): string {
  return PATTERNS.reduce((s, [re, fn = () => MASK]) => s.replace(re, fn), text);
}
