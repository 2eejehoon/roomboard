// T092: screens.md S5. The token lives in this tab's sessionStorage only (precedent 2026-11-06-admin-token).
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Link } from '@astryxdesign/core/Link';
import { List, ListItem } from '@astryxdesign/core/List';
import { Stack } from '@astryxdesign/core/Stack';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useCallback, useEffect, useState } from 'react';
import { LOCALE, t } from '../i18n/t.ts';
import { Loading, NetworkError, RateLimited } from '../Status.tsx';

const KEY = 'rb.adminToken';
const PANEL = 'admin-reports'; // one panel; both tabs fill it with their list
type Status = 'open' | 'resolved';
type Report = {
  id: number;
  targetType: 'room' | 'message';
  roomId: string;
  roomTitle: string | null;
  messageSnapshot: { nickname: string; text: string; sentAt: number; channel: number } | null;
  reason: 'spam' | 'abuse' | 'sexual' | 'illegal' | 'other';
  createdAt: number;
  reportCount: number;
};
// key: the tab and attempt it was loaded for; a load for another key reads as loading.
type Load = { key: string } & (
  | { kind: 'loading' | 'network' }
  | { kind: 'rateLimited'; retryAfterMs: number }
  | { kind: 'ok'; items: Report[]; nextCursor: string | null }
);

// sessionStorage can throw (blocked storage); then the token lives as long as the page.
const stored = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const store = (token: string | null) => {
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* memory only */
  }
};
const time = (ms: number) => new Date(ms).toLocaleString(LOCALE);

export function AdminPage() {
  const [token, setToken] = useState(stored);
  const [refused, setRefused] = useState(false);
  const signOut = useCallback(() => {
    store(null);
    setToken(null);
    setRefused(true);
  }, []);
  if (!token) {
    return (
      <TokenForm
        refused={refused}
        onSubmit={(value) => {
          store(value);
          setToken(value);
        }}
      />
    );
  }
  return <Reports token={token} onUnauthorized={signOut} />;
}

function TokenForm({ refused, onSubmit }: { refused: boolean; onSubmit: (token: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value) onSubmit(value);
      }}
    >
      <Stack gap={4} padding={4}>
        <Heading level={1}>{t('admin.heading')}</Heading>
        <TextInput
          type="password"
          label={t('admin.token')}
          value={value}
          onChange={setValue}
          isRequired
          status={refused ? { type: 'error', message: t('admin.unauthorized') } : undefined}
        />
        <Button type="submit" label={t('admin.enter')} />
      </Stack>
    </form>
  );
}

function Reports({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const [status, setStatus] = useState<Status>('open');
  const [attempt, setAttempt] = useState(0);
  const key = `${status}.${attempt}`;
  const [loaded, setLoad] = useState<Load>({ key: '', kind: 'loading' });
  const load: Load = loaded.key === key ? loaded : { key, kind: 'loading' };
  const [deleting, setDeleting] = useState<Report | null>(null);

  // Any answer but 2xx: 401 drops the token, 429 and the rest are the common states. 410 is a room deleted already, which is
  // what an admin delete wanted.
  const call = useCallback(
    (path: string, method = 'GET'): Promise<Response | null> =>
      fetch(`/api/admin/${path}`, { method, headers: { authorization: `Bearer ${token}` } }).then(
        async (res) => {
          if (res.ok || res.status === 410) return res;
          if (res.status === 401) onUnauthorized();
          else if (res.status === 429)
            setLoad({ key, kind: 'rateLimited', retryAfterMs: ((await res.json().catch(() => ({}))) as { retryAfterMs?: number }).retryAfterMs ?? 60_000 });
          else setLoad({ key, kind: 'network' });
          return null;
        },
        () => (setLoad({ key, kind: 'network' }), null),
      ),
    [token, onUnauthorized, key],
  );

  const page = useCallback(
    (cursor: string | null) =>
      call(`reports?status=${status}${cursor ? `&cursor=${cursor}` : ''}`).then(async (res) => {
        if (!res) return;
        const next = (await res.json()) as { items: Report[]; nextCursor: string | null };
        setLoad((old) => ({
          key,
          kind: 'ok',
          items: cursor && old.kind === 'ok' && old.key === key ? [...old.items, ...next.items] : next.items,
          nextCursor: next.nextCursor,
        }));
      }),
    [call, status, key],
  );

  useEffect(() => void page(null), [page]);

  const act = async (path: string, method: string) => {
    if (await call(path, method)) setAttempt((n) => n + 1);
  };

  return (
    <Stack gap={4} padding={4}>
      <Heading level={1}>{t('admin.heading')}</Heading>
      <TabList role="tablist" value={status} onChange={(v) => setStatus(v as Status)}>
        <Tab value="open" panelId={PANEL} label={t('admin.open')} />
        <Tab value="resolved" panelId={PANEL} label={t('admin.resolved')} />
      </TabList>
      <Stack id={PANEL} role="tabpanel" gap={4}>
        {load.kind === 'loading' && <Loading />}
        {load.kind === 'network' && <NetworkError onRetry={() => setAttempt((n) => n + 1)} />}
        {load.kind === 'rateLimited' && <RateLimited retryAfterMs={load.retryAfterMs} />}
        {load.kind === 'ok' && load.items.length === 0 && (
          <div role="status">
            <Banner status="info" title={t('admin.empty')} />
          </div>
        )}
        {load.kind === 'ok' && load.items.length > 0 && (
          <List>
            {load.items.map((r) => (
              <ListItem
                key={r.id}
                label={
                  <>
                    {t(`admin.target.${r.targetType}`)} · <Link href={`/rooms/${r.roomId}`}>{r.roomTitle ?? t('admin.noTitle')}</Link>
                  </>
                }
                description={
                  <Stack gap={1}>
                    {r.messageSnapshot && <Text as="p">{t('admin.snapshot', { ...r.messageSnapshot, at: time(r.messageSnapshot.sentAt) })}</Text>}
                    <Text as="p">
                      {t('admin.reason', { reason: t(`report.reason.${r.reason}`) })} · {t('admin.count', { n: r.reportCount })} ·{' '}
                      {t('admin.at', { at: time(r.createdAt) })}
                    </Text>
                  </Stack>
                }
                endContent={
                  status === 'open' && (
                    <Stack direction="horizontal" gap={2} wrap="wrap">
                      <Button label={t('admin.deleteRoom')} variant="destructive" onClick={() => setDeleting(r)} />
                      <Button label={t('admin.resolve')} onClick={() => void act(`reports/${r.id}/resolve`, 'POST')} />
                    </Stack>
                  )
                }
              />
            ))}
          </List>
        )}
        {load.kind === 'ok' && load.nextCursor && <Button label={t('board.more')} variant="secondary" onClick={() => void page(load.nextCursor)} />}
      </Stack>
      <AlertDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('admin.deleteRoom')}
        description={t('admin.confirmDelete')}
        actionLabel={t('admin.deleteRoom')}
        cancelLabel={t('admin.cancel')}
        onAction={() => {
          if (deleting) void act(`rooms/${deleting.roomId}`, 'DELETE');
          setDeleting(null);
        }}
      />
    </Stack>
  );
}
