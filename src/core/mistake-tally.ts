// 002 US4 (FR-030): open a guardrail issue for every category with two or more records and none yet;
// comment on an open one only when this event added a new record.
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
  // Categories this event newly recorded (not a re-posted tag already counted).
  trigger: string[];
  categories: string[];
  // Guardrail issues per category, open or closed. A closed one means the guard exists (or was ruled out).
  issues: Record<string, { number: number; open: boolean }>;
}): TallyAction[] {
  const seen = new Set(records.map((r) => `${r.id}\n${r.ref}`));
  const count = (id: string) => [...seen].filter((k) => k.startsWith(`${id}\n`)).length;
  // Every category, not only this event's: a cancelled queued run would otherwise never be recovered. `>= 2`: records
  // #2 and #3 landing together are both seen as 3.
  return categories
    .filter((id) => count(id) >= 2 && (!issues[id] || (issues[id].open && trigger.includes(id))))
    .map((id): TallyAction => (issues[id] ? { id, action: 'comment', issue: issues[id].number } : { id, action: 'open' }));
}

export function mistakeTags(text: string): string[] {
  return [...new Set([...text.matchAll(/\[mistake:([a-z0-9-]+)\]/g)].map((m) => m[1]))];
}
