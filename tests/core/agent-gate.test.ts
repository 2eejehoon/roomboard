import { describe, expect, it } from 'vitest';
import { shouldRunAgent } from '../../src/core/agent-gate.ts';

describe('shouldRunAgent (contracts/github.md 실행 조건)', () => {
  it('runs on agent:run', () => {
    expect(shouldRunAgent({ action: 'labeled', addedLabel: 'agent:run', labels: ['agent:run'] })).toEqual({ run: true, attempt: 1 });
  });

  it('runs on a gated service issue, not an ungated one', () => {
    expect(shouldRunAgent({ action: 'labeled', addedLabel: 'agent:gated', labels: ['source:service', 'agent:gated'] }).run).toBe(true);
    expect(shouldRunAgent({ action: 'labeled', addedLabel: 'source:service', labels: ['source:service'] }).run).toBe(false);
  });

  it('runs on an operator-made user report issue', () => {
    expect(shouldRunAgent({ action: 'labeled', addedLabel: 'source:user-report', labels: ['source:user-report'] }).run).toBe(true);
  });

  it('does not run on a reopened external issue without labels', () => {
    expect(shouldRunAgent({ action: 'reopened', labels: [] })).toEqual({ run: false, reason: 'no-trigger-label' });
  });

  it('agent:skip and agent:needs-human always win', () => {
    expect(shouldRunAgent({ action: 'labeled', addedLabel: 'agent:run', labels: ['agent:run', 'agent:skip'] }).run).toBe(false);
    expect(shouldRunAgent({ action: 'reopened', labels: ['agent:run', 'agent:needs-human'] }).run).toBe(false);
  });

  it('ignores labeled events for unrelated labels (our own status labels must not loop)', () => {
    expect(shouldRunAgent({ action: 'labeled', addedLabel: 'agent:working', labels: ['agent:run', 'agent:working'] }).run).toBe(false);
    expect(shouldRunAgent({ action: 'labeled', addedLabel: 'bug', labels: ['agent:run', 'bug'] }).run).toBe(false);
  });

  it('does not start while a run is in progress', () => {
    expect(shouldRunAgent({ action: 'reopened', labels: ['agent:run', 'agent:working'] }).run).toBe(false);
  });

  it('counts attempts and stops after two', () => {
    expect(shouldRunAgent({ action: 'dispatch', labels: ['agent:run', 'agent:attempt-1'] })).toEqual({ run: true, attempt: 2 });
    expect(shouldRunAgent({ action: 'dispatch', labels: ['agent:run', 'agent:attempt-1', 'agent:attempt-2'] })).toEqual({ run: false, reason: 'max-attempts' });
  });
});

describe('one run per trigger', () => {
  it('a later trigger label on an issue that already ran does not start another run (retries go through the queue or reopen)', () => {
    expect(shouldRunAgent({ action: 'labeled', addedLabel: 'agent:gated', labels: ['agent:run', 'agent:gated', 'agent:attempt-1'] })).toEqual({
      run: false,
      reason: 'already-attempted',
    });
  });

  it('reopen and the queue still retry', () => {
    expect(shouldRunAgent({ action: 'reopened', labels: ['agent:run', 'agent:attempt-1'] })).toEqual({ run: true, attempt: 2 });
    expect(shouldRunAgent({ action: 'dispatch', labels: ['agent:run', 'agent:attempt-1'] })).toEqual({ run: true, attempt: 2 });
  });
});
