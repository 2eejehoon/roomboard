import { useEffect, useRef } from 'react';

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
export function Turnstile({ onToken, onError }: { onToken: (token: string) => void; onError: () => void }) {
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
