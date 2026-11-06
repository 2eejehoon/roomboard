// Profanity filter (research R11) for chat, room titles and descriptions. The word list is passed in (src/data/profanity-ko.txt)
// so core never loads files.

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

// One normalized character, the source character it came from, whether it opens or closes that source character, and the
// word (run of characters between spaces or symbols) it belongs to.
type Unit = { ch: string; src: number; first: boolean; last: boolean; word: number };

function normalize(chars: string[]): { units: Unit[]; wordLength: number[] } {
  const units: Unit[] = [];
  const wordLength: number[] = [];
  let word = -1;
  let inWord = false;
  chars.forEach((c, src) => {
    const code = c.charCodeAt(0);
    let parts: string[];
    if (code >= 0xac00 && code <= 0xd7a3) {
      const s = code - 0xac00;
      parts = [CHO[Math.floor(s / 588)], JUNG[Math.floor((s % 588) / 28)], JONG[s % 28]].filter(Boolean);
    } else if (/[\p{L}\p{N}]/u.test(c)) {
      parts = [c.toLowerCase()];
    } else {
      inWord = false; // spaces and symbols inserted to dodge the filter
      return;
    }
    if (!inWord) {
      inWord = true;
      wordLength.push(0);
      word++;
    }
    wordLength[word]++;
    parts.forEach((ch, i) => units.push({ ch, src, first: i === 0, last: i === parts.length - 1, word }));
  });
  return { units, wordLength };
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
    const { units, wordLength } = normalize(chars);
    const masked = new Set<number>();
    for (const p of patterns) {
      for (let i = 0; i + p.length <= units.length; i++) {
        const end = units[i + p.length - 1];
        // Whole source characters only: "조절" holds ㅈㅗㅈ but must not match "좆".
        if (!units[i].first || !end.last || p.some((ch, j) => units[i + j].ch !== ch)) continue;
        // Across a gap only one-character pieces count ("씨 발", "f u c k"), never "몇 시 발표" or "push it".
        if (units[i].word !== end.word && units.slice(i, i + p.length).some((u) => wordLength[u.word] > 1)) continue;
        for (let s = units[i].src; s <= end.src; s++) masked.add(s);
      }
    }
    return masked.size ? chars.map((c, i) => (masked.has(i) ? '*' : c)).join('') : text;
  };
}
