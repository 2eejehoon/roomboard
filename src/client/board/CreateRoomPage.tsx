// screens.md S2 (T066). Checks with the server's schema before sending (precedent 2026-11-08-create-form-checks). S4 shares the fields.
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Stack } from '@astryxdesign/core/Stack';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoomRequest, fieldErrors, type FieldErrors } from '../../core/api-schemas.ts';
import { THEME_IDS, THEMES, type ThemeId } from '../../core/themes.ts';
import { navigate } from '../App.tsx';
import { t } from '../i18n/t.ts';
import { NetworkError, RateLimited } from '../Status.tsx';

type Failure = { kind: 'turnstile' | 'network' } | { kind: 'rateLimited'; retryAfterMs: number } | null;

export function CreateRoomPage() {
  const [fields, setFields] = useState<Fields>({ title: '', description: '', themeId: '' });
  const { title, themeId } = fields;
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [widget, setWidget] = useState(0); // a new key renders a fresh widget: tokens are single-use
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<Failure>(null);
  const [sending, setSending] = useState(false);

  // 403 and other failures after the server checked the token spent it; 400 and 429 come before that check.
  const scriptFailed = useCallback(() => setFailure({ kind: 'network' }), []); // stable: the widget effect depends on it
  const retryWidget = () => {
    setToken('');
    setWidget((n) => n + 1);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = createRoomRequest.safeParse({ ...fields, password, turnstileToken: token });
    setErrors(parsed.success ? {} : fieldErrors(parsed.error));
    setFailure(null);
    if (!parsed.success) return;
    setSending(true);
    const res = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(parsed.data) }).catch(() => null);
    setSending(false);
    const body = (await res?.json().catch(() => null)) as { id?: string; fields?: FieldErrors; retryAfterMs?: number } | null;
    if (res?.status === 201 && body?.id) return navigate(`/rooms/${body.id}`);
    if (res?.status === 400) return setErrors(body?.fields ?? {});
    if (res?.status === 429) return setFailure({ kind: 'rateLimited', retryAfterMs: body?.retryAfterMs ?? 60_000 });
    setFailure({ kind: res?.status === 403 ? 'turnstile' : 'network' });
    retryWidget();
  }

  return (
    <form onSubmit={submit}>
      <Stack gap={4} padding={4}>
        <Heading level={1}>{t('create.heading')}</Heading>
        <RoomFields value={fields} onChange={setFields} errors={errors} />
        <TextInput
          type="password"
          label={t('create.password')}
          description={t('create.passwordHint')}
          value={password}
          onChange={(v) => setPassword(v.slice(0, 64))}
          isRequired
          status={errorStatus(errors, 'password')}
        />
        <Turnstile key={widget} onToken={setToken} onError={scriptFailed} />
        {failure?.kind === 'turnstile' && <p role="alert">{t('create.turnstileFailed')}</p>}
        {failure?.kind === 'rateLimited' && <RateLimited retryAfterMs={failure.retryAfterMs} />}
        {failure?.kind === 'network' && (
          <NetworkError
            onRetry={() => {
              setFailure(null);
              retryWidget();
            }}
          />
        )}
        <Button type="submit" label={t('create.submit')} isDisabled={!title || !themeId || !password || !token || sending} />
      </Stack>
    </form>
  );
}

export type Fields = { title: string; description: string; themeId: ThemeId | '' };

// The field's error under it, wired to aria-invalid and aria-describedby.
export const errorStatus = (errors: FieldErrors, field: keyof FieldErrors) =>
  errors[field] ? { type: 'error' as const, message: t(errors[field]) } : undefined;

// Title, description and theme: S2 and S4 (T084).
export function RoomFields({ value, onChange, errors }: { value: Fields; onChange: (v: Fields) => void; errors: FieldErrors }) {
  const { title, description, themeId } = value;
  return (
    <>
      <TextInput
        label={t('create.title')}
        description={t('create.remaining', { n: 60 - title.length })}
        value={title}
        onChange={(v) => onChange({ ...value, title: v.slice(0, 60) })}
        isRequired
        status={errorStatus(errors, 'title')}
      />
      <TextArea
        label={t('create.description')}
        description={t('create.remaining', { n: 300 - description.length })}
        value={description}
        // slice: Astryx fields take no native maxLength (TextArea's draws its own counter and does not cut).
        onChange={(v) => onChange({ ...value, description: v.slice(0, 300) })}
        status={errorStatus(errors, 'description')}
      />
      <RadioList
        label={t('create.theme')}
        value={themeId}
        onChange={(id) => onChange({ ...value, themeId: id as ThemeId })}
        status={errorStatus(errors, 'themeId')}
      >
        {THEME_IDS.map((id) => (
          <RadioListItem
            key={id}
            value={id}
            label={t(THEMES[id].nameKey)}
            startContent={<img src={`/assets/previews/${id}.jpg`} alt="" width={160} height={90} />}
          />
        ))}
      </RadioList>
    </>
  );
}

// Cloudflare Turnstile, explicit rendering. The script loads once; each mount renders one widget.
type TurnstileApi = { render(el: HTMLElement, o: Record<string, unknown>): string; remove(id: string): void };
let script: Promise<TurnstileApi> | undefined;
const loadTurnstile = () =>
  (script ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.onload = () => resolve((window as unknown as { turnstile: TurnstileApi }).turnstile);
    s.onerror = () => {
      script = undefined;
      reject(new Error('turnstile script'));
    };
    document.head.append(s);
  }));

// onError: the script did not load (blocked, offline); without it there is never a token.
function Turnstile({ onToken, onError }: { onToken: (token: string) => void; onError: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | undefined;
    let live = true;
    loadTurnstile()
      .then((api) => {
        if (!live || !el.current) return;
        id = api.render(el.current, {
          sitekey: import.meta.env.VITE_TURNSTILE_SITEKEY,
          callback: onToken,
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        });
      })
      .catch(() => live && onError());
    return () => {
      live = false;
      if (id) void loadTurnstile().then((api) => api.remove(id!));
    };
  }, [onToken, onError]);
  return <div ref={el} />;
}
