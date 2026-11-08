// screens.md S2 (T066). Checks with the server's schema before sending (precedent 2026-11-08-create-form-checks).
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoomRequest, fieldErrors, type FieldErrors } from '../../core/api-schemas.ts';
import { THEME_IDS, THEMES, type ThemeId } from '../../core/themes.ts';
import { navigate } from '../App.tsx';
import { t } from '../i18n/t.ts';
import { NetworkError, RateLimited } from '../Status.tsx';

type Failure = { kind: 'turnstile' | 'network' } | { kind: 'rateLimited'; retryAfterMs: number } | null;

export function CreateRoomPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [themeId, setThemeId] = useState<ThemeId | ''>('');
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
    const parsed = createRoomRequest.safeParse({ title, description, themeId, password, turnstileToken: token });
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

  const error = (field: keyof FieldErrors) => errors[field] && <p id={`${field}-error`}>{t(errors[field])}</p>;
  return (
    <form onSubmit={submit} noValidate>
      <h1>{t('create.heading')}</h1>
      <label>
        {t('create.title')}
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} required aria-describedby="title-error" />
      </label>
      <p>{t('create.remaining', { n: 60 - title.length })}</p>
      {error('title')}
      <label>
        {t('create.description')}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} aria-describedby="description-error" />
      </label>
      <p>{t('create.remaining', { n: 300 - description.length })}</p>
      {error('description')}
      <fieldset aria-describedby="themeId-error">
        <legend>{t('create.theme')}</legend>
        {THEME_IDS.map((id) => (
          <label key={id}>
            <input type="radio" name="theme" value={id} checked={themeId === id} onChange={() => setThemeId(id)} />
            <img src={`/assets/previews/${id}.jpg`} alt="" width={160} height={90} />
            {t(THEMES[id].nameKey)}
          </label>
        ))}
      </fieldset>
      {error('themeId')}
      <label>
        {t('create.password')}
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={64} required aria-describedby="password-hint password-error" />
      </label>
      <p id="password-hint">{t('create.passwordHint')}</p>
      {error('password')}
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
      <button type="submit" disabled={!title || !themeId || !password || !token || sending}>
        {t('create.submit')}
      </button>
    </form>
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
