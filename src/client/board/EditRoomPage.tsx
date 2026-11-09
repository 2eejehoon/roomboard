// screens.md S4 (T084). Checks with the server's schema before sending, as S2 does (precedent 2026-11-08-create-form-checks).
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Stack } from '@astryxdesign/core/Stack';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useEffect, useState, type FormEvent } from 'react';
import { deleteRoomRequest, fieldErrors, updateRoomRequest, type FieldErrors } from '../../core/api-schemas.ts';
import type { ThemeId } from '../../core/themes.ts';
import { navigate } from '../App.tsx';
import { t } from '../i18n/t.ts';
import { Notice } from '../room/RoomPage.tsx';
import { Loading, NetworkError, RateLimited } from '../Status.tsx';
import { errorStatus, RoomFields, type Fields } from './CreateRoomPage.tsx';

type Load = { status: 'loading' | 'error' | 404 | 410 } | { status: 'ok'; themeId: ThemeId };
type Failure = { kind: 'wrongPassword' | 'network' } | { kind: 'rateLimited'; retryAfterMs: number } | null;

export function EditRoomPage({ id }: { id: string }) {
  const url = `/api/rooms/${encodeURIComponent(id)}`;
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [fields, setFields] = useState<Fields>({ title: '', description: '', themeId: '' });
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<Failure>(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(url)
      .then(async (res) => {
        if (!live) return;
        if (res.status === 404 || res.status === 410) return setLoad({ status: res.status });
        if (!res.ok) return setLoad({ status: 'error' });
        const room = (await res.json()) as { title: string; description: string; themeId: ThemeId };
        setFields({ title: room.title, description: room.description, themeId: room.themeId });
        setLoad({ status: 'ok', themeId: room.themeId });
      })
      .catch(() => live && setLoad({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [url, attempt]);

  // Both requests answer 400 / 403 / 404 / 410 / 429 the same way (openapi.yaml).
  async function send(method: 'PATCH' | 'DELETE', body: unknown, done: () => void) {
    setSending(true);
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    setSending(false);
    const reply = (await res?.json().catch(() => null)) as { fields?: FieldErrors; retryAfterMs?: number } | null;
    if (res?.ok) return done();
    if (res?.status === 400) return setErrors(reply?.fields ?? {});
    if (res?.status === 403) return setFailure({ kind: 'wrongPassword' });
    if (res?.status === 404 || res?.status === 410) return setLoad({ status: res.status });
    if (res?.status === 429) return setFailure({ kind: 'rateLimited', retryAfterMs: reply?.retryAfterMs ?? 60_000 });
    setFailure({ kind: 'network' });
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const parsed = updateRoomRequest.safeParse({ ...fields, password });
    setErrors(parsed.success ? {} : fieldErrors(parsed.error));
    setFailure(null);
    if (parsed.success) void send('PATCH', parsed.data, () => navigate(`/rooms/${id}`));
  }

  function remove() {
    setConfirming(false);
    const parsed = deleteRoomRequest.safeParse({ password });
    setErrors(parsed.success ? {} : fieldErrors(parsed.error));
    setFailure(null);
    if (parsed.success) void send('DELETE', parsed.data, () => navigate('/'));
  }

  if (load.status === 'loading') return <Loading />;
  if (load.status === 'error') return <NetworkError onRetry={() => setAttempt((n) => n + 1)} />;
  if (load.status !== 'ok') return <Notice text={t(load.status === 404 ? 'room.notFound' : 'room.gone')} />;
  return (
    <form onSubmit={save}>
      <Stack gap={4} padding={4}>
        <Heading level={1}>{t('edit.heading')}</Heading>
        <RoomFields value={fields} onChange={setFields} errors={errors} />
        {fields.themeId !== load.themeId && <p role="status">{t('edit.themeNotice')}</p>}
        <TextInput
          type="password"
          label={t('create.password')}
          value={password}
          onChange={(v) => setPassword(v.slice(0, 64))}
          isRequired
          status={errorStatus(errors, 'password')}
        />
        {failure?.kind === 'wrongPassword' && <p role="alert">{t('edit.wrongPassword')}</p>}
        {failure?.kind === 'rateLimited' && <RateLimited retryAfterMs={failure.retryAfterMs} />}
        {failure?.kind === 'network' && <NetworkError onRetry={() => setFailure(null)} />}
        <Stack direction="horizontal" gap={2}>
          <Button type="submit" label={t('edit.save')} isDisabled={sending} />
          <Button label={t('edit.delete')} variant="destructive" isDisabled={sending} onClick={() => setConfirming(true)} />
        </Stack>
      </Stack>
      <AlertDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title={t('edit.delete')}
        description={t('edit.confirmDelete')}
        actionLabel={t('edit.delete')}
        cancelLabel={t('edit.cancel')}
        onAction={remove}
      />
    </form>
  );
}
