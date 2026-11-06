// Profanity filter (research R11) for chat, room titles and descriptions. The word list is passed in (src/data/profanity-ko.txt)
// so core never loads files.

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

// One normalized character, the source character it came from, and whether it opens or closes that source character.
type Unit = { ch: string; src: number; first: boolean; last: boolean };

function normalize(chars: string[]): Unit[] {
  const units: Unit[] = [];
  chars.forEach((c, src) => {
    const code = c.charCodeAt(0);
    let parts: string[];
    if (code >= 0xac00 && code <= 0xd7a3) {
      const s = code - 0xac00;
      parts = [CHO[Math.floor(s / 588)], JUNG[Math.floor((s % 588) / 28)], JONG[s % 28]].filter(Boolean);
    } else if (/[\p{L}\p{N}]/u.test(c)) {
      parts = [c.toLowerCase()];
    } else {
      return; // spaces and symbols inserted to dodge the filter
    }
    parts.forEach((ch, i) => units.push({ ch, src, first: i === 0, last: i === parts.length - 1 }));
  });
  return units;
}

export const parseWordList = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

export function createChatFilter(words: string[]): (text: string) => string {
  const patterns = words.map((w) => normalize([...w]).map((u) => u.ch)).filter((p) => p.length > 0);
  return (text) => {
    const chars = [...text];
    const units = normalize(chars);
    const masked = new Set<number>();
    for (const p of patterns) {
      for (let i = 0; i + p.length <= units.length; i++) {
        const end = units[i + p.length - 1];
        // Whole source characters only: "조절" holds ㅈㅗㅈ but must not match "좆".
        if (!units[i].first || !end.last || p.some((ch, j) => units[i + j].ch !== ch)) continue;
        for (let s = units[i].src; s <= end.src; s++) masked.add(s);
      }
    }
    return masked.size ? chars.map((c, i) => (masked.has(i) ? '*' : c)).join('') : text;
  };
}
