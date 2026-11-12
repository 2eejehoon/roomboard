import { describe, expect, it } from 'vitest';
import { mistakeTags, tallyMistakes } from '../../src/core/mistake-tally.ts';

const categories = ['skip-test', 'pii-in-logs'];

describe('tallyMistakes', () => {
  it('opens a guardrail issue when the triggering category reaches 2', () => {
    const records = [
      { id: 'skip-test', ref: 'pr#3' },
      { id: 'skip-test', ref: 'comment#90' },
    ];
    expect(tallyMistakes({ records, trigger: ['skip-test'], categories, openIssues: {} })).toEqual([{ id: 'skip-test', action: 'open' }]);
  });

  it('does nothing on the first or third record', () => {
    const one = [{ id: 'skip-test', ref: 'pr#3' }];
    const three = [...one, { id: 'skip-test', ref: 'pr#4' }, { id: 'skip-test', ref: 'pr#5' }];
    expect(tallyMistakes({ records: one, trigger: ['skip-test'], categories, openIssues: {} })).toEqual([]);
    expect(tallyMistakes({ records: three, trigger: ['skip-test'], categories, openIssues: {} })).toEqual([]);
  });

  it('counts the same record once (event payload merged with listed records)', () => {
    const records = [
      { id: 'skip-test', ref: 'pr#3' },
      { id: 'skip-test', ref: 'pr#3' },
    ];
    expect(tallyMistakes({ records, trigger: ['skip-test'], categories, openIssues: {} })).toEqual([]);
  });

  it('only reports categories the triggering event recorded', () => {
    const records = [
      { id: 'skip-test', ref: 'pr#3' },
      { id: 'skip-test', ref: 'pr#4' },
      { id: 'pii-in-logs', ref: 'pr#5' },
    ];
    expect(tallyMistakes({ records, trigger: ['pii-in-logs'], categories, openIssues: {} })).toEqual([]);
  });

  it('ignores ids not in the category list', () => {
    const records = [
      { id: 'made-up', ref: 'pr#3' },
      { id: 'made-up', ref: 'pr#4' },
    ];
    expect(tallyMistakes({ records, trigger: ['made-up'], categories, openIssues: {} })).toEqual([]);
  });

  it('comments on the open guardrail issue instead of opening another', () => {
    const records = [
      { id: 'pii-in-logs', ref: 'pr#3' },
      { id: 'pii-in-logs', ref: 'pr#4' },
    ];
    expect(tallyMistakes({ records, trigger: ['pii-in-logs'], categories, openIssues: { 'pii-in-logs': 21 } })).toEqual([
      { id: 'pii-in-logs', action: 'comment', issue: 21 },
    ]);
  });
});

describe('mistakeTags', () => {
  it('reads each [mistake:<id>] tag once', () => {
    expect(mistakeTags('차단: 테스트를 건너뜀 [mistake:skip-test]. 또 [mistake:skip-test], [mistake:pii-in-logs]')).toEqual(['skip-test', 'pii-in-logs']);
  });

  it('ignores malformed tags', () => {
    expect(mistakeTags('[mistake:] [mistake:Bad Id] [mistake: skip-test] mistake:skip-test')).toEqual([]);
  });
});
