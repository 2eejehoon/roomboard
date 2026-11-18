import { describe, expect, it } from 'vitest';
import { mistakeTags, tallyMistakes } from '../../src/core/mistake-tally.ts';

const categories = ['skip-test', 'pii-in-logs'];

describe('tallyMistakes', () => {
  it('opens a guardrail issue when the triggering category reaches 2', () => {
    const records = [
      { id: 'skip-test', ref: 'pr#3' },
      { id: 'skip-test', ref: 'comment#90' },
    ];
    expect(tallyMistakes({ records, trigger: ['skip-test'], categories, issues: {} })).toEqual([{ id: 'skip-test', action: 'open' }]);
  });

  it('does nothing on the first record', () => {
    expect(tallyMistakes({ records: [{ id: 'skip-test', ref: 'pr#3' }], trigger: ['skip-test'], categories, issues: {} })).toEqual([]);
  });

  // Two records landing close together: both runs list 3, and the guardrail must still open once (runs are serialized).
  it('opens when a run already sees a third record and no guardrail issue exists', () => {
    const records = ['pr#3', 'pr#4', 'pr#5'].map((ref) => ({ id: 'skip-test', ref }));
    expect(tallyMistakes({ records, trigger: ['skip-test'], categories, issues: {} })).toEqual([{ id: 'skip-test', action: 'open' }]);
  });

  it('does nothing once the guardrail issue for the category is closed', () => {
    const records = ['pr#3', 'pr#4', 'pr#5'].map((ref) => ({ id: 'skip-test', ref }));
    expect(tallyMistakes({ records, trigger: ['skip-test'], categories, issues: { 'skip-test': { number: 21, open: false } } })).toEqual([]);
  });

  it('counts the same record once (event payload merged with listed records)', () => {
    const records = [
      { id: 'skip-test', ref: 'pr#3' },
      { id: 'skip-test', ref: 'pr#3' },
    ];
    expect(tallyMistakes({ records, trigger: ['skip-test'], categories, issues: {} })).toEqual([]);
  });

  // A queued run can be cancelled by a newer one (one pending run per concurrency group): any later run recovers it.
  it('opens a category already at 2 with no issue even when this event recorded something else', () => {
    const records = [
      { id: 'skip-test', ref: 'pr#3' },
      { id: 'skip-test', ref: 'pr#4' },
      { id: 'pii-in-logs', ref: 'pr#5' },
    ];
    expect(tallyMistakes({ records, trigger: [], categories, issues: {} })).toEqual([{ id: 'skip-test', action: 'open' }]);
  });

  it('does not comment again when the event added no new record (re-posted review tag)', () => {
    const records = [
      { id: 'pii-in-logs', ref: 'pr#3' },
      { id: 'pii-in-logs', ref: 'pr#4' },
    ];
    expect(tallyMistakes({ records, trigger: [], categories, issues: { 'pii-in-logs': { number: 21, open: true } } })).toEqual([]);
  });

  it('ignores ids not in the category list', () => {
    const records = [
      { id: 'made-up', ref: 'pr#3' },
      { id: 'made-up', ref: 'pr#4' },
    ];
    expect(tallyMistakes({ records, trigger: ['made-up'], categories, issues: {} })).toEqual([]);
  });

  it('comments on the open guardrail issue instead of opening another', () => {
    const records = [
      { id: 'pii-in-logs', ref: 'pr#3' },
      { id: 'pii-in-logs', ref: 'pr#4' },
    ];
    expect(tallyMistakes({ records, trigger: ['pii-in-logs'], categories, issues: { 'pii-in-logs': { number: 21, open: true } } })).toEqual([
      { id: 'pii-in-logs', action: 'comment', issue: 21 },
    ]);
  });
});

describe('mistakeTags', () => {
  // Only the tag that ends a comment counts (pr-review skill): a review that quotes the syntax as an example must not
  // count. The first real run opened #71 from two such quotes on PR #59 and #64.
  it('reads the tag that ends the comment', () => {
    expect(mistakeTags('차단: 테스트를 건너뜀. [mistake:skip-test]')).toEqual(['skip-test']);
    expect(mistakeTags('차단: 로그에 기기 키 [mistake:pii-in-logs]\n')).toEqual(['pii-in-logs']);
  });

  it('ignores a tag quoted inside the text', () => {
    expect(mistakeTags('리뷰 하나에 `[mistake:skip-test]` 댓글이 두 개 있으면 두 실행 모두 3을 센다.')).toEqual([]);
    expect(mistakeTags('[mistake:skip-test] 태그는 끝에 붙인다고 적었다')).toEqual([]);
  });

  it('ignores malformed tags', () => {
    expect(mistakeTags('설명 [mistake:Bad Id]')).toEqual([]);
    expect(mistakeTags('설명 [mistake:]')).toEqual([]);
    expect(mistakeTags('설명 `[mistake:skip-test]`')).toEqual([]);
  });
});
