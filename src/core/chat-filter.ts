// Profanity filter (research R11) for chat, room titles and descriptions. The word list is passed in (src/data/profanity-ko.txt)
// so core never loads files.

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

// Compatibility jamo for one code point: a precomposed syllable, a conjoining jamo (NFD input, or what NFKC turns typed
// jamo into), or a lowercased letter or digit. Spaces and symbols give nothing.
function jamo(c: string): string[] {
  const code = c.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const s = code - 0xac00;
    return [CHO[Math.floor(s / 588)], JUNG[Math.floor((s % 588) / 28)], JONG[s % 28]].filter(Boolean);
  }
  if (code >= 0x1100 && code < 0x1113) return [CHO[code - 0x1100]];
  if (code >= 0x1161 && code < 0x1176) return [JUNG[code - 0x1161]];
  if (code >= 0x11a8 && code < 0x11c3) return [JONG[code - 0x11a7]];
  return /[\p{L}\p{N}]/u.test(c) ? [c.toLowerCase()] : [];
}

// One normalized character, the source character it came from, whether it opens or closes that source character, and the
// word (run of characters between spaces or symbols) it belongs to.
type Unit = { ch: string; src: number; first: boolean; last: boolean; word: number };
type Normalized = { units: Unit[]; wordStart: number[]; wordEnd: number[] };

function normalize(chars: string[]): Normalized {
  const out: Normalized = { units: [], wordStart: [], wordEnd: [] };
  let inWord = false;
  chars.forEach((c, src) => {
    // NFKC per character keeps source indices: full-width "ｆ" becomes "f".
    const parts = [...c.normalize('NFKC')].flatMap(jamo);
    if (!parts.length) {
      inWord = false; // spaces and symbols inserted to dodge the filter
      return;
    }
    if (!inWord) {
      inWord = true;
      out.wordStart.push(src);
    }
    const word = out.wordStart.length - 1;
    out.wordEnd[word] = src;
    parts.forEach((ch, i) => out.units.push({ ch, src, first: i === 0, last: i === parts.length - 1, word }));
  });
  return out;
}

export const parseWordList = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

export function createChatFilter(words: string[]): (text: string) => string {
  const patterns = words.map((w) => normalize([...w]).units.map((u) => u.ch)).filter((p) => p.length > 0);
  return (text) => {
    const chars = [...text];
    const { units, wordStart, wordEnd } = normalize(chars);
    const masked = new Set<number>();
    for (const p of patterns) {
      for (let i = 0; i + p.length <= units.length; i++) {
        const end = units[i + p.length - 1];
        // Whole source characters only: "조절" holds ㅈㅗㅈ but must not match "좆".
        if (!units[i].first || !end.last || p.some((ch, j) => units[i + j].ch !== ch)) continue;
        // Across a gap only whole words count ("개 새끼", "f u c k"), never part of one ("몇 시 발표", "push it").
        if (units[i].word !== end.word && (units[i].src !== wordStart[units[i].word] || end.src !== wordEnd[end.word])) continue;
        for (let s = units[i].src; s <= end.src; s++) masked.add(s);
      }
    }
    return masked.size ? chars.map((c, i) => (masked.has(i) ? '*' : c)).join('') : text;
  };
}
