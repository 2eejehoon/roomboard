// T073: screens.md S3 채팅 패널, shared by 3D and 2D. Report buttons per message come with US7.
import { useEffect, useId, useRef, useState } from 'react';
import { t } from '../i18n/t.ts';
import type { RoomState } from '../state/room-store.ts';

type Props = { state: RoomState; send: (text: string) => void; view: '3d' | '2d' };

export function ChatPanel({ state, send, view }: Props) {
  const heading = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');

  // Enter focuses the input unless something else has focus (a focused button keeps its own Enter).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || document.activeElement !== document.body) return;
      e.preventDefault();
      input.current?.focus();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const section = (
    <section aria-labelledby={heading}>
      <h2 id={heading}>{t('chat.heading')}</h2>
      {/* column-reverse keeps a scrolled 3D list pinned to the newest message without script */}
      <div style={view === '3d' ? { maxHeight: '30vh', overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse' } : undefined}>
        {/* Only the list is live: nothing in it changes while typing. 2D only (screens.md S3 2D). */}
        <ul aria-live={view === '2d' ? 'polite' : undefined}>
          {state.chat.map((c) => (
            <li key={c.messageId}>
              <strong>{c.nickname}</strong> {c.text}
            </li>
          ))}
        </ul>
      </div>
      {state.chatLimited !== null && <p role="status">{t('common.rateLimited', { seconds: Math.ceil(state.chatLimited / 1000) })}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // A blank message would be a bad_message on the server, and five of those close the socket.
          if (!text.trim()) return;
          send(text.trim());
          setText('');
        }}
      >
        <input
          ref={input}
          aria-label={t('chat.input')}
          value={text}
          maxLength={200}
          disabled={state.connection !== 'open'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        />
        <button type="submit" disabled={state.connection !== 'open'}>
          {t('chat.send')}
        </button>
      </form>
    </section>
  );
  if (view === '2d') return section;
  // Over the 3D canvas: folded on touch devices (a tap opens it), open with a keyboard.
  return (
    <details
      open={!matchMedia('(pointer: coarse)').matches}
      style={{ position: 'fixed', left: '50%', bottom: 0, transform: 'translateX(-50%)', width: 'min(100%, 22rem)', zIndex: 20, background: 'rgb(255 255 255 / 0.85)' }}
    >
      <summary>{t('chat.heading')}</summary>
      {section}
    </details>
  );
}
