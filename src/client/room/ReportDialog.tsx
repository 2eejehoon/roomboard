// T091: screens.md 신고 대화상자, for a room (header) and a chat message (ChatPanel), in 3D and 2D alike.
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import type { CreateReportRequest } from '../../core/api-schemas.ts';
import { deviceKey } from '../device.ts';
import { t } from '../i18n/t.ts';
import { NetworkError, RateLimited } from '../Status.tsx';

type Reason = CreateReportRequest['reason'];
const REASONS: Reason[] = ['spam', 'abuse', 'sexual', 'illegal', 'other'];
type Result = { kind: 'accepted' | 'duplicate' | 'expired' | 'network' } | { kind: 'rateLimited'; retryAfterMs: number } | null;

export function ReportDialog({ target, onClose }: { target: CreateReportRequest['target']; onClose: () => void }) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result>(null);

  const send = async () => {
    if (!reason) return;
    setSending(true);
    const body: CreateReportRequest = { target, reason, deviceKey: deviceKey() };
    const res = await fetch('/api/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    setSending(false);
    if (res?.status === 201 || res?.status === 200) return setResult({ kind: res.status === 201 ? 'accepted' : 'duplicate' });
    const err = (await res?.json().catch(() => null)) as { fields?: { message?: string }; retryAfterMs?: number } | null;
    if (res?.status === 429) return setResult({ kind: 'rateLimited', retryAfterMs: err?.retryAfterMs ?? 60_000 });
    // A 400 without the expired key or a 410 room cannot be fixed by retrying either, but nothing better can be said here.
    setResult({ kind: res?.status === 400 && err?.fields?.message === 'report.expired' ? 'expired' : 'network' });
  };

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} purpose="form">
      <DialogHeader title={t(target.type === 'room' ? 'report.room' : 'report.messageTitle')} onOpenChange={(open) => !open && onClose()} />
      {result?.kind === 'accepted' || result?.kind === 'duplicate' || result?.kind === 'expired' ? (
        <div role="status">
          <Text as="p">{t(`report.${result.kind}`)}</Text>
        </div>
      ) : (
        <Stack gap={4}>
          {result?.kind === 'rateLimited' && <RateLimited retryAfterMs={result.retryAfterMs} />}
          {result?.kind === 'network' && <NetworkError onRetry={() => void send()} />}
          <RadioList label={t('report.reason')} value={reason ?? ''} onChange={(v) => setReason(v as Reason)} isRequired>
            {REASONS.map((r) => (
              <RadioListItem key={r} value={r} label={t(`report.reason.${r}`)} />
            ))}
          </RadioList>
          <Button label={t('report.send')} onClick={() => void send()} isDisabled={!reason || sending} />
        </Stack>
      )}
    </Dialog>
  );
}
