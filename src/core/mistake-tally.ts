// 002 US4 (FR-030): count mistake records per category and act when one reaches its second record.
// A record is a merged PR's `cause:<id>` label or a review comment's `[mistake:<id>]` tag.

export type MistakeRecord = { id: string; ref: string };
export type TallyAction = { id: string; action: 'open' } | { id: string; action: 'comment'; issue: number };

export function tallyMistakes({
  records,
  trigger,
  categories,
  openIssues,
}: {
  records: MistakeRecord[];
  trigger: string[];
  categories: string[];
  openIssues: Record<string, number>;
}): TallyAction[] {
  const seen = new Set(records.map((r) => `${r.id}\n${r.ref}`));
  const count = (id: string) => [...seen].filter((k) => k.startsWith(`${id}\n`)).length;
  // Only the categories this event recorded: an unrelated event must not re-fire a category already at 2.
  return [...new Set(trigger)]
    .filter((id) => categories.includes(id) && count(id) === 2)
    .map((id) => (id in openIssues ? { id, action: 'comment', issue: openIssues[id] } : { id, action: 'open' }));
}

export function mistakeTags(text: string): string[] {
  return [...new Set([...text.matchAll(/\[mistake:([a-z0-9-]+)\]/g)].map((m) => m[1]))];
}
