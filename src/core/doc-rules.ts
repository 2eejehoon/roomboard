// Document checks D1-D6 (specs/002-auto-bugfix-loop/contracts/doc-checks.md). Pure: callers supply file contents.

export type Change = { status: 'A' | 'M' | 'D'; path: string };
export type DocsInput = {
  changes: Change[];
  head: Map<string, string>;
  base: Map<string, string>;
  labels: string[];
};
export type Violation = { rule: `D${1 | 2 | 3 | 4 | 5 | 6}`; path: string; message: string };

const CONSTITUTION = '.specify/memory/constitution.md';
const PRECEDENT_DIR = 'docs/precedents/';
const INDEX = `${PRECEDENT_DIR}README.md`;
const PRECEDENT_NAME = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/;
const PRECEDENT_MAX_LINES = 40;
const REQUIRED_FIELDS = ['- 날짜:', '- 대상:', '- 출처:', '- 대체한 판례:', '## 결정', '## 이유', '## 검토한 대안'];
const NEEDS_PRECEDENT = [/^\.specify\/memory\/constitution\.md$/, /^specs\/[^/]+\/spec\.md$/, /^specs\/[^/]+\/plan\.md$/];

const isPrecedent = (path: string) => path.startsWith(PRECEDENT_DIR) && path !== INDEX && !path.slice(PRECEDENT_DIR.length).includes('/');
const lineCount = (text: string) => text.replace(/\n+$/, '').split('\n').length;

export function checkDocs({ changes, head, base, labels }: DocsInput): Violation[] {
  const out: Violation[] = [];

  // D1
  const decisionChange = changes.find((c) => NEEDS_PRECEDENT.some((r) => r.test(c.path)));
  const addsPrecedent = changes.some((c) => c.status === 'A' && isPrecedent(c.path));
  if (decisionChange && !addsPrecedent && !labels.includes('no-precedent')) {
    out.push({
      rule: 'D1',
      path: decisionChange.path,
      message:
        `${decisionChange.path}을(를) 바꿨지만 새 판례가 없습니다. 결정을 바꿨다면 docs/precedents/YYYY-MM-DD-<slug>.md를 추가하고 ` +
        `docs/precedents/README.md 목록에 넣으세요. 결정이 바뀌지 않는 오타 수정이면 PR에 no-precedent 라벨을 붙이세요.`,
    });
  }

  // D2
  for (const c of changes) {
    if (!isPrecedent(c.path) || !base.has(c.path)) continue;
    const before = base.get(c.path)!.replace(/\s+$/, '');
    const after = head.get(c.path)?.replace(/\s+$/, '');
    const appended = after?.startsWith(before) ? after.slice(before.length).trim() : null;
    if (appended !== null && (appended === '' || /^대체됨: \S+$/.test(appended))) continue;
    out.push({
      rule: 'D2',
      path: c.path,
      message: `머지된 판례 ${c.path}는 고치거나 지울 수 없습니다. 새 판례를 쓰고, 이 파일 맨 끝에는 "대체됨: <새 판례 파일>" 한 줄만 추가하세요.`,
    });
  }

  // D3, D4
  const precedents = [...head.keys()].filter(isPrecedent);
  for (const path of precedents) {
    const name = path.slice(PRECEDENT_DIR.length);
    const text = head.get(path)!;
    const problems: string[] = [];
    if (!PRECEDENT_NAME.test(name)) problems.push('파일 이름을 YYYY-MM-DD-<slug>.md(slug는 소문자·숫자·하이픈)로 바꾸세요');
    const missing = REQUIRED_FIELDS.filter((f) => !text.split('\n').some((l) => l.startsWith(f)));
    if (missing.length) problems.push(`빠진 항목을 추가하세요: ${missing.map((f) => f.replace(/^(- |## )/, '').replace(/:$/, '')).join(', ')}`);
    const lines = lineCount(text);
    if (lines > PRECEDENT_MAX_LINES) problems.push(`${lines}줄입니다. ${PRECEDENT_MAX_LINES}줄 이하로 줄이세요`);
    if (problems.length) out.push({ rule: 'D3', path, message: `판례 형식 오류: ${problems.join('. ')}.` });
  }
  const indexed = new Set([...(head.get(INDEX) ?? '').matchAll(/\]\(([^)\s]+\.md)\)/g)].map((m) => m[1]));
  const files = new Set(precedents.map((p) => p.slice(PRECEDENT_DIR.length)));
  for (const f of files) if (!indexed.has(f)) out.push({ rule: 'D4', path: INDEX, message: `${f}가 판례 목록에 없습니다. ${INDEX} 표에 행을 추가하세요.` });
  for (const f of indexed) if (!files.has(f)) out.push({ rule: 'D4', path: INDEX, message: `판례 목록의 ${f} 파일이 없습니다. 표에서 그 행을 지우거나 파일을 추가하세요.` });

  // D5
  const limits = parseLimits(head.get(CONSTITUTION) ?? '');
  for (const [path, text] of head) {
    const row = limits.find((l) => l.pattern.test(path));
    if (!row || row.max === null) continue;
    const lines = lineCount(text);
    if (lines > row.max) {
      out.push({
        rule: 'D5',
        path,
        message: `${path}가 ${lines}줄로 상한 ${row.max}줄(헌법 문서 구조 표 \`${row.glob}\`)을 넘었습니다. 역할이 다른 내용을 표의 알맞은 문서로 옮기거나 줄이세요.`,
      });
    }
  }

  // D6
  for (const [path, text] of head) {
    if (/^specs\/[^/]+\/spec\.md$/.test(path) && /^## Clarifications\s*$/m.test(text)) {
      out.push({ rule: 'D6', path, message: `${path}에 Clarifications 절이 있습니다. 답을 본문(FR 등)에 반영하고 Q&A는 판례로 옮긴 뒤 이 절을 지우세요.` });
    }
  }

  return out;
}

type Limit = { glob: string; pattern: RegExp; max: number | null };

function parseLimits(constitution: string): Limit[] {
  const section = constitution.split(/^## /m).find((s) => s.startsWith('문서 구조')) ?? '';
  const out: Limit[] = [];
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    const glob = /^`([^`]+)`$/.exec(cells[1] ?? '')?.[1];
    const limit = cells[3];
    if (!glob || limit === undefined) continue;
    const n = /(\d+)줄/.exec(limit);
    out.push({ glob, pattern: globToRegExp(glob), max: n ? Number(n[1]) : null });
  }
  return out;
}

function globToRegExp(glob: string): RegExp {
  const re = glob
    .split(/(\*\*\/|\*)/)
    .map((part) => (part === '**/' ? '(?:.*/)?' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${re}$`);
}
