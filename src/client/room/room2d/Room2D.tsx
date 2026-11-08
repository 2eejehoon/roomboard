// screens.md S3 2D: the same room state as text. App's <main> holds it; chat (US4) and reports (US7) join later.
import type { RoomInfo } from '../../../core/room-session.ts';
import { THEMES, zoneAt } from '../../../core/themes.ts';
import { t } from '../../i18n/t.ts';
import type { RoomState } from '../../state/room-store.ts';

export function Room2D({ room, state }: { room: Pick<RoomInfo, 'title' | 'description' | 'roomData'>; state: RoomState }) {
  const { themeId } = room.roomData;
  const people = state.you ? [state.you, ...state.peers] : state.peers;
  return (
    <section>
      <h1>{room.title}</h1>
      {room.description && <p>{room.description}</p>}
      <p>
        {t('room2d.theme', { name: t(THEMES[themeId].nameKey) })}
        {state.channel !== null && ` · ${t('room.channel', { n: state.channel })}`}
      </p>
      <h2>{t('room2d.people')}</h2>
      <ul>
        {people.map((p) => (
          <li key={p.peerId}>
            {p.nickname}
            {p === state.you && ` ${t('room2d.me')}`} · {t(`room2d.anim.${p.a}`)} · {t(zoneAt(themeId, p.p))}
          </li>
        ))}
      </ul>
      <div aria-live="polite">
        {state.notices.map((n) => (
          <p key={n.id}>{t(n.kind === 'joined' ? 'room2d.joined' : 'room2d.left', { nickname: n.nickname })}</p>
        ))}
      </div>
    </section>
  );
}
