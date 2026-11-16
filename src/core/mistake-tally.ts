// 002 US4 (FR-030): count mistake records per category and act once one has two or more and no guardrail issue yet.
// A record is a merged PR's `cause:<id>` label or a review comment's `[mistake:<id>]` tag.

export type MistakeRecord = { id: string; ref: string };
export type TallyAction = { id: string; action: 'open' } | { id: string; action: 'comment'; issue: number };

export function tallyMistakes({
  records,
  trigger,
  categories,
  issues,
}: {
  records: MistakeRecord[];
  trigger: string[];
  categories: string[];
  // Guardrail issues per category, open or closed. A closed one means the guard exists (or was ruled out).
  issues: Record<string, { number: number; open: boolean }>;
}): TallyAction[] {
  const seen = new Set(records.map((r) => `${r.id}\n${r.ref}`));
  const count = (id: string) => [...seen].filter((k) => k.startsWith(`${id}\n`)).length;
  // Only the categories this event recorded. `>= 2`, not `=== 2`: records #2 and #3 landing together are both seen as 3.
  return [...new Set(trigger)]
    .filter((id) => categories.includes(id) && count(id) >= 2 && issues[id]?.open !== false)
    .map((id): TallyAction => (issues[id] ? { id, action: 'comment', issue: issues[id].number } : { id, action: 'open' }));
}

export function mistakeTags(text: string): string[] {
  return [...new Set([...text.matchAll(/\[mistake:([a-z0-9-]+)\]/g)].map((m) => m[1]))];
}
