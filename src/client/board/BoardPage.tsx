// screens.md S1 (T065): newest rooms first, next page on scroll or "더 보기".
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Link } from '@astryxdesign/core/Link';
import { List, ListItem } from '@astryxdesign/core/List';
import { Stack } from '@astryxdesign/core/Stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { THEMES, type ThemeId } from '../../core/themes.ts';
import { LOCALE, t } from '../i18n/t.ts';
import { Loading, NetworkError } from '../Status.tsx';

type Summary = { id: string; title: string; themeId: ThemeId; onlineCount: number; createdAt: number };
type Page = { items: Summary[]; nextCursor: string | null };

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];
const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
// "3시간 전": the largest unit that fits; under a minute is "지금".
export function ago(then: number, now: number): string {
  const [unit, ms] = UNITS.find(([, ms]) => now - then >= ms) ?? ['second', 1000];
  return rtf.format(unit === 'second' ? 0 : -Math.floor((now - then) / ms), unit);
}

export function BoardPage() {
  const [items, setItems] = useState<Summary[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'idle' | 'error'>('loading');
  const more = useRef<HTMLButtonElement>(null);

  // Callers show 'loading' first (the first page starts in it).
  const load = useCallback(
    (cursor: string | null) =>
      fetch(`/api/rooms${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const page = (await res.json()) as Page;
          setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
          setNext(page.nextCursor);
          setStatus('idle');
        })
        .catch(() => setStatus('error')),
    [],
  );

  useEffect(() => void load(null), [load]);
  const loadMore = useCallback(
    (cursor: string | null) => {
      setStatus('loading');
      void load(cursor);
    },
    [load],
  );
  const [now] = useState(Date.now); // relative times as of opening the board

  // Infinite scroll: the "더 보기" button loads the next page as it scrolls into view (and stays for keyboard users).
  useEffect(() => {
    const button = more.current;
    if (!button || status !== 'idle' || !next) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && loadMore(next));
    io.observe(button);
    return () => io.disconnect();
  }, [status, next, loadMore]);
  return (
    <Stack as="section" gap={4} padding={4}>
      <Stack as="header" direction="horizontal" justify="between" vAlign="center">
        <Heading level={1}>{t('board.heading')}</Heading>
        <Link href="/new">{t('board.create')}</Link>
      </Stack>
      {status === 'idle' && items.length === 0 && (
        <EmptyState title={t('board.empty')} headingLevel={2} actions={<Link href="/new">{t('board.createFirst')}</Link>} />
      )}
      <List hasDividers>
        {items.map((r) => (
          <ListItem
            key={r.id}
            href={`/rooms/${r.id}`}
            label={r.title}
            description={`${t(THEMES[r.themeId].nameKey)} · ${t('board.online', { n: r.onlineCount })} · ${ago(r.createdAt, now)}`}
          />
        ))}
      </List>
      {status === 'loading' && <Loading />}
      {status === 'error' && <NetworkError onRetry={() => loadMore(items.length ? next : null)} />}
      {status === 'idle' && next && <Button ref={more} label={t('board.more')} variant="secondary" onClick={() => loadMore(next)} />}
    </Stack>
  );
}
