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
      // Skipped: spaces and symbols inserted to dodge the filter. Only whitespace ends a word; "씨.발" and a zero-width
      // space stay one word, so the stricter cross-word rules below never apply to them.
      if (/\s/u.test(c)) inWord = false;
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

// Particles and endings that may follow a spaced-out banned word ("개 새끼야", "미친 놈들아").
// Standalone jamo after the word is laughter or crying ("씨 발ㅋㅋ"), never the rest of an ordinary word.
const LAUGHTER = /^[\u3131-\u318e]+$/;
const ENDINGS = new Set(['아', '야', '이', '이야', '들', '들아', '들이', '은', '는', '이랑', '같은']);

export const parseWordList = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

export function createChatFilter(words: string[]): (text: string) => string {
  // A particle may follow only a long word: "개 새끼야" yes, but "씨 발아" (germination) and "몇 시 팔아" are real sentences.
  const patterns = words
    .map((w) => ({ ch: normalize([...w]).units.map((u) => u.ch), takesEnding: [...w].length >= 3 }))
    .filter((p) => p.ch.length > 0);
  return (text) => {
    // NFC first: NFD splits a syllable into jamo code points, which would defeat the whole-syllable rule ("조절" vs "좆").
    const chars = [...text.normalize('NFC')];
    const { units, wordStart, wordEnd } = normalize(chars);
    const masked = new Set<number>();
    for (const { ch: p, takesEnding } of patterns) {
      for (let i = 0; i + p.length <= units.length; i++) {
        const end = units[i + p.length - 1];
        // Whole source characters only: "조절" holds ㅈㅗㅈ but must not match "좆".
        if (!units[i].first || !end.last || p.some((ch, j) => units[i + j].ch !== ch)) continue;
        // Across a gap the match starts a word and ends one, give or take a particle: "개 새끼야" and "f u c k" match;
        // "push it", "a bit chilly", "포도 씨 발라" and "몇 시 팔아요" do not.
        if (units[i].word !== end.word) {
          const rest = chars.slice(end.src + 1, wordEnd[end.word] + 1).join('');
          const ending = !rest || LAUGHTER.test(rest) || (takesEnding && ENDINGS.has(rest));
          if (units[i].src !== wordStart[units[i].word] || !ending) continue;
        }
        for (let s = units[i].src; s <= end.src; s++) masked.add(s);
      }
    }
    return masked.size ? chars.map((c, i) => (masked.has(i) ? '*' : c)).join('') : text;
  };
}
