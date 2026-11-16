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

  it('only reports categories the triggering event recorded', () => {
    const records = [
      { id: 'skip-test', ref: 'pr#3' },
      { id: 'skip-test', ref: 'pr#4' },
      { id: 'pii-in-logs', ref: 'pr#5' },
    ];
    expect(tallyMistakes({ records, trigger: ['pii-in-logs'], categories, issues: {} })).toEqual([]);
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
  it('reads each [mistake:<id>] tag once', () => {
    expect(mistakeTags('차단: 테스트를 건너뜀 [mistake:skip-test]. 또 [mistake:skip-test], [mistake:pii-in-logs]')).toEqual(['skip-test', 'pii-in-logs']);
  });

  it('ignores malformed tags', () => {
    expect(mistakeTags('[mistake:] [mistake:Bad Id] [mistake: skip-test] mistake:skip-test')).toEqual([]);
  });
});
