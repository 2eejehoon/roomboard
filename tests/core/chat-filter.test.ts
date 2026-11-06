import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createChatFilter, parseWordList } from '../../src/core/chat-filter.ts';

const listFile = readFileSync(new URL('../../src/data/profanity-ko.txt', import.meta.url), 'utf8');
const filter = createChatFilter(parseWordList(listFile));

describe('parseWordList', () => {
  it('reads one word per line, skips blanks and # comments', () => {
    expect(parseWordList('# c\nfoo\n\n  bar  \n')).toEqual(['foo', 'bar']);
  });

  it('the shipped list has Korean and English words', () => {
    const words = parseWordList(listFile);
    expect(words.some((w) => /[가-힣]/.test(w))).toBe(true);
    expect(words.some((w) => /[a-z]/.test(w))).toBe(true);
  });
});

describe('chat filter', () => {
  const f = createChatFilter(['씨발', '병신', 'fuck']);

  it('masks banned words with one * per character', () => {
    expect(f('아 씨발 진짜')).toBe('아 ** 진짜');
    expect(f('너 병신이야')).toBe('너 **이야');
    expect(f('what the FUCK')).toBe('what the ****');
  });

  it('masks spaces and symbols inserted inside a word', () => {
    expect(f('씨 발')).toBe('***');
    expect(f('씨.발!')).toBe('***!');
    expect(f('병_신')).toBe('***');
    expect(f('f u c k')).toBe('*******');
  });

  it('masks words typed as separated jamo', () => {
    expect(f('ㅆㅣㅂㅏㄹ')).toBe('*****');
    expect(f('ㅂㅕㅇ신')).toBe('****');
    expect(f('씹ㅏㄹ')).toBe('***');
  });

  it('leaves normal sentences alone', () => {
    for (const s of ['안녕하세요 반가워요', '오늘 날씨가 좋네요!', '병원 신호등 앞에서 만나요', 'see you soon', '']) expect(f(s)).toBe(s);
  });

  it('does not join the end of one word to the start of the next', () => {
    for (const s of ['몇 시 발표해?', 'push it', 'this hit', 'a bit chilly']) expect(filter(s), s).toBe(s);
    expect(f('씨 발 진짜')).toBe('*** 진짜');
    expect(f('아씨 발')).toBe('아씨 발');
  });

  it('masks whole words split by one gap', () => {
    expect(filter('개 새끼')).toBe('****');
    expect(filter('저 미친 놈')).toBe('저 ****');
    expect(f('fu ck')).toBe('*****');
    expect(filter('개 새끼야')).toBe('****야');
    expect(filter('미친 놈아')).toBe('****아');
    expect(filter('씨 발놈아')).toBe('***놈아');
  });

  it('masks NFD Hangul and full-width letters', () => {
    expect(f('씨발'.normalize('NFD'))).toBe('*****');
    expect(f('ｆｕｃｋ')).toBe('****');
    expect(f('안녕'.normalize('NFD'))).toBe('안녕'.normalize('NFD'));
  });

  it('leaves dictionary words that contain a banned word alone', () => {
    expect(filter('시발점에서 출발')).toBe('시발점에서 출발');
  });

  it('only matches on whole syllables, not jamo spanning syllables', () => {
    const g = createChatFilter(['좆', 'ㅅㅂ']);
    expect(g('볼륨 조절해 주세요')).toBe('볼륨 조절해 주세요');
    expect(g('옷방 정리')).toBe('옷방 정리');
    expect(g('ㅅㅂ')).toBe('**');
  });

  it('the shipped list masks common words', () => {
    expect(filter('씨발')).toBe('**');
    expect(filter('shit')).toBe('****');
  });
});
