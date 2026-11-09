// T073: screens.md S3 채팅 패널, shared by 3D and 2D. Report buttons per message come with US7.
import { Heading } from '@astryxdesign/core/Heading';
import { Stack } from '@astryxdesign/core/Stack';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useEffect, useId, useRef, useState } from 'react';
import { t } from '../i18n/t.ts';
import type { RoomState } from '../state/room-store.ts';

const MAX_CHAT = 200; // protocol.ts chat text

type Props = { state: RoomState; send: (text: string) => void; view: '3d' | '2d' };

export function ChatPanel({ state, send, view }: Props) {
  const heading = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const lastSent = useRef('');
  // No maxLength: a paste would be cut silently. Over the limit it is not sent and the sender is told (spec.md Edge Cases).
  const tooLong = text.trim().length > MAX_CHAT;

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

  // The server dropped my last message (rate_limited): put it back unless I already started another.
  // shortcut: restores only the latest send; two sends before rate_limited arrives lose the first. Match rate_limited.nonce if that shows up.
  useEffect(() => {
    if (state.chatLimited !== null) setText((now) => now || lastSent.current);
  }, [state.chatLimited]);

  const section = (
    <section aria-labelledby={heading}>
      <Heading level={2} id={heading}>
        {t('chat.heading')}
      </Heading>
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
      {tooLong && <p role="status">{t('chat.tooLong')}</p>}
      {state.chatLimited !== null && <p role="status">{t('common.rateLimited', { seconds: Math.ceil(state.chatLimited / 1000) })}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // A blank message would be a bad_message on the server, and five of those close the socket.
          // While rate-limited the server would drop it too; keep it in the input until the wait is over.
          if (!text.trim() || tooLong || state.chatLimited !== null) return;
          lastSent.current = text.trim();
          send(text.trim());
          setText('');
        }}
      >
        <Stack direction="horizontal" gap={2} vAlign="end">
          <TextInput
            ref={input}
            label={t('chat.input')}
            isLabelHidden
            value={text}
            isDisabled={state.connection !== 'open'}
            onChange={setText}
            onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
          />
          {/* Native: Astryx Button carries its own empty live region, and only the message list may be live (precedent 2026-11-09-chat-panel). */}
          <button type="submit" disabled={state.connection !== 'open'}>
            {t('chat.send')}
          </button>
        </Stack>
      </form>
    </section>
  );
  if (view === '2d') return section;
  // Over the 3D canvas: folded on touch devices (a tap opens it), open with a keyboard.
  const touch = matchMedia('(pointer: coarse)').matches;
  return (
    <details
      open={!touch}
      // On touch devices sit above TouchControls (joystick box 200px at bottom 16) so moving and jumping stay possible.
      style={{ position: 'fixed', left: '50%', bottom: touch ? 232 : 0, transform: 'translateX(-50%)', width: 'min(100%, 22rem)', zIndex: 20, background: 'rgb(255 255 255 / 0.85)' }}
    >
      <summary>{t('chat.heading')}</summary>
      {section}
    </details>
  );
}
