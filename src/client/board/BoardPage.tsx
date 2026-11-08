// screens.md S1 (T065): newest rooms first, next page on scroll or "더 보기".
import { useCallback, useEffect, useRef, useState } from 'react';
import { THEMES, type ThemeId } from '../../core/themes.ts';
import { Link } from '../App.tsx';
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
    <section>
      <header>
        <h1>{t('board.heading')}</h1>
        <Link href="/new">{t('board.create')}</Link>
      </header>
      {status === 'idle' && items.length === 0 && (
        <div>
          <p>{t('board.empty')}</p>
          <Link href="/new">{t('board.createFirst')}</Link>
        </div>
      )}
      <ul className="board">
        {items.map((r) => (
          <li key={r.id}>
            <Link href={`/rooms/${r.id}`}>
              <h2>{r.title}</h2>
              <p>
                {t(THEMES[r.themeId].nameKey)} · {t('board.online', { n: r.onlineCount })} · {ago(r.createdAt, now)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {status === 'loading' && <Loading />}
      {status === 'error' && <NetworkError onRetry={() => loadMore(items.length ? next : null)} />}
      {status === 'idle' && next && (
        <button type="button" ref={more} onClick={() => loadMore(next)}>
          {t('board.more')}
        </button>
      )}
    </section>
  );
}
