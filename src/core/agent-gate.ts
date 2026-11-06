// Agent run condition (specs/002-auto-bugfix-loop/contracts/github.md "에이전트 실행 조건").

// No 'opened': creating an issue with labels also emits 'labeled', so listening to both would start two runs.
export type GateInput = { action: 'reopened' | 'labeled' | 'dispatch'; addedLabel?: string; labels: string[] };
export type GateResult = { run: true; attempt: 1 | 2 } | { run: false; reason: string };

const TRIGGER_LABELS = ['agent:run', 'agent:gated', 'source:user-report'];

export function shouldRunAgent({ action, addedLabel, labels }: GateInput): GateResult {
  const has = (l: string) => labels.includes(l);
  if (action === 'labeled' && !TRIGGER_LABELS.includes(addedLabel ?? '')) return { run: false, reason: 'unrelated-label' };
  if (has('agent:skip') || has('agent:needs-human')) return { run: false, reason: 'blocked' };
  if (has('agent:working')) return { run: false, reason: 'already-running' };
  if (!(has('agent:run') || (has('source:service') && has('agent:gated')) || has('source:user-report'))) return { run: false, reason: 'no-trigger-label' };
  if (has('agent:attempt-2')) return { run: false, reason: 'max-attempts' };
  // Retries come from reopen or the queue (dispatch), not from another trigger label.
  if (action === 'labeled' && has('agent:attempt-1')) return { run: false, reason: 'already-attempted' };
  return { run: true, attempt: has('agent:attempt-1') ? 2 : 1 };
}
