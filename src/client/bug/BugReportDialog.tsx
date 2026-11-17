// 002 T042 (FR-004, US3): the room header's bug report, in 3D and 2D alike. The text goes to the admin only; the context is the
// screen's state, never free text (precedent 2026-11-17-user-bug-reports).
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import type { userBugReport } from '../../core/api-schemas.ts';
import { t } from '../i18n/t.ts';
import { NetworkError, RateLimited } from '../Status.tsx';
import { Turnstile } from '../Turnstile.tsx';
import { browserOf, recentFingerprints } from './collector.ts';

type Context = z.infer<typeof userBugReport>['context'];
type Result = { kind: 'accepted' | 'turnstile' | 'network' } | { kind: 'rateLimited'; retryAfterMs: number } | null;

export function BugReportDialog({ context, onClose }: { context: Pick<Context, 'view' | 'themeId' | 'connection'>; onClose: () => void }) {
  const [text, setText] = useState('');
  const [token, setToken] = useState('');
  const [widget, setWidget] = useState(0); // a new key renders a fresh widget: tokens are single-use
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const inFlight = useRef(false); // two quick clicks come before a re-render (ReportDialog, PR #39 review)
  const statusRef = useRef<HTMLDivElement>(null);
  const accepted = result?.kind === 'accepted';
  useEffect(() => {
    if (accepted) statusRef.current?.focus(); // the focused send button goes away with the form (ReportDialog, T095)
  }, [accepted]);
  const scriptFailed = useCallback(() => setResult({ kind: 'network' }), []); // stable: the widget effect depends on it

  const send = async () => {
    if (!text.trim() || !token || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    const body = {
      text,
      context: { ...context, recentFingerprints: recentFingerprints(), appVersion: import.meta.env.VITE_APP_VERSION || 'dev', browser: browserOf(navigator.userAgent) },
      turnstileToken: token,
    } satisfies z.input<typeof userBugReport>;
    const res = await fetch('/api/bug-reports/user', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    inFlight.current = false;
    setSending(false);
    if (res?.status === 201) return setResult({ kind: 'accepted' });
    // 429 comes before the Turnstile check, so the token is still good; anything after it spent the token.
    if (res?.status === 429) {
      const err = (await res.json().catch(() => null)) as { retryAfterMs?: number } | null;
      return setResult({ kind: 'rateLimited', retryAfterMs: err?.retryAfterMs ?? 60_000 });
    }
    setResult({ kind: res?.status === 403 ? 'turnstile' : 'network' });
    setToken('');
    setWidget((n) => n + 1);
  };

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} purpose="form">
      <DialogHeader title={t('bug.open')} onOpenChange={(open) => !open && onClose()} />
      {accepted ? (
        <div role="status" tabIndex={-1} ref={statusRef}>
          <Text as="p">{t('bug.accepted')}</Text>
        </div>
      ) : (
        <Stack gap={4}>
          {result?.kind === 'rateLimited' && <RateLimited retryAfterMs={result.retryAfterMs} />}
          {result?.kind === 'turnstile' && <p role="alert">{t('create.turnstileFailed')}</p>}
          {result?.kind === 'network' && <NetworkError onRetry={() => setResult(null)} />}
          <TextArea
            label={t('bug.text')}
            description={`${t('bug.note')} · ${t('create.remaining', { n: 1000 - text.length })}`}
            value={text}
            onChange={(v) => setText(v.slice(0, 1000))}
            isRequired
          />
          <Turnstile key={widget} onToken={setToken} onError={scriptFailed} />
          <Button label={t('report.send')} onClick={() => void send()} isDisabled={!text.trim() || !token || sending} />
        </Stack>
      )}
    </Dialog>
  );
}
