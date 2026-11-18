// 002 T042 (FR-014, US3): pending user bug reports. "이슈로 만들기" publishes only the admin's title and summary; "버리기" deletes
// the text at once. The server does not claim a report before the create, so a click waits for the answer (precedent 2026-11-17-user-bug-reports).
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { List, ListItem } from '@astryxdesign/core/List';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useEffect, useRef, useState } from 'react';
import { LOCALE, t } from '../i18n/t.ts';
import { Loading, NetworkError } from '../Status.tsx';

type Fail = { kind: 'network'; status?: number };
export type AdminCall = (path: string, method?: string, body?: unknown) => Promise<Response | Fail | null>;
type Context = { view?: string; themeId?: string; connection?: string; appVersion?: string; browser?: string; recentFingerprints?: string[] };
type BugReport = { id: number; text: string; context: Context; createdAt: number; expiresAt: number };
type Load = { kind: 'loading' } | Fail | { kind: 'ok'; items: BugReport[] };

const time = (ms: number) => new Date(ms).toLocaleString(LOCALE);

export function BugReportsTab({ call }: { call: AdminCall }) {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [issued, setIssued] = useState<number | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    void call('bug-reports').then(async (res) => {
      if (!live || !res) return;
      setLoad(res instanceof Response ? { kind: 'ok', items: ((await res.json()) as { items: BugReport[] }).items } : res);
    });
    return () => {
      live = false;
    };
  }, [call, attempt]);

  // One action at a time: a second click on "이슈로 만들기" before the answer would make a second issue.
  const act = async (path: string, method: string, body?: unknown) => {
    if (busy.current) return;
    busy.current = true;
    setRetry(null);
    setIssued(null);
    const res = await call(path, method, body);
    busy.current = false;
    if (!res) return;
    // 404: another tab or the 30-day Cron already handled it, so reload and the stale row goes (PR #70 review). Any other
    // failure keeps the retry (PR #73 review).
    if (!(res instanceof Response) && res.status !== 404) return setRetry(() => () => void act(path, method, body));
    if (res instanceof Response && method === 'POST') setIssued(((await res.json()) as { issueNumber: number }).issueNumber);
    setAttempt((n) => n + 1);
  };

  return (
    <Stack gap={4}>
      {issued !== null && (
        <div role="status">
          <Banner status="success" title={t('admin.bugs.issued', { n: issued })} />
        </div>
      )}
      {retry && <NetworkError onRetry={retry} />}
      {load.kind === 'loading' && <Loading />}
      {load.kind === 'network' && <NetworkError onRetry={() => setAttempt((n) => n + 1)} />}
      {load.kind === 'ok' && load.items.length === 0 && (
        <div role="status">
          <Banner status="info" title={t('admin.bugs.empty')} />
        </div>
      )}
      {load.kind === 'ok' && load.items.length > 0 && (
        <List>
          {load.items.map((r) => (
            <Row key={r.id} report={r} onIssue={(body) => void act(`bug-reports/${r.id}/issue`, 'POST', body)} onDiscard={() => void act(`bug-reports/${r.id}`, 'DELETE')} />
          ))}
        </List>
      )}
    </Stack>
  );
}

function Row({ report: r, onIssue, onDiscard }: { report: BugReport; onIssue: (body: { title: string; summary: string }) => void; onDiscard: () => void }) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const c = r.context;
  return (
    <ListItem
      label={r.text}
      description={
        <Stack gap={2}>
          <Text as="p">
            {t('admin.bugs.context', {
              view: c.view ?? '-',
              theme: c.themeId ?? '-',
              connection: c.connection ?? '-',
              version: c.appVersion ?? '-',
              browser: c.browser ?? '-',
              fingerprints: c.recentFingerprints?.join(', ') || '-',
            })}
          </Text>
          <Text as="p">
            {t('admin.at', { at: time(r.createdAt) })} · {t('admin.bugs.expires', { at: time(r.expiresAt) })}
          </Text>
          <TextInput label={t('admin.bugs.issueTitle')} value={title} onChange={(v) => setTitle(v.slice(0, 80))} isRequired />
          <TextArea label={t('admin.bugs.summary')} description={t('admin.bugs.summaryHint')} value={summary} onChange={(v) => setSummary(v.slice(0, 2000))} isRequired />
          <Stack direction="horizontal" gap={2} wrap="wrap">
            <Button label={t('admin.bugs.issue')} onClick={() => onIssue({ title, summary })} isDisabled={!title.trim() || !summary.trim()} />
            <Button label={t('admin.bugs.discard')} variant="destructive" onClick={onDiscard} />
          </Stack>
        </Stack>
      }
    />
  );
}
