// screens.md S3 2D: the same room state as text. App's <main> holds it and the ChatPanel after it; reports (US7) join later.
import { Heading } from '@astryxdesign/core/Heading';
import { List, ListItem } from '@astryxdesign/core/List';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import type { RoomInfo } from '../../../core/room-session.ts';
import { THEMES, zoneAt } from '../../../core/themes.ts';
import { t } from '../../i18n/t.ts';
import type { RoomState } from '../../state/room-store.ts';

export function Room2D({ room, state }: { room: Pick<RoomInfo, 'title' | 'description' | 'roomData'>; state: RoomState }) {
  const { themeId } = room.roomData;
  const people = state.you ? [state.you, ...state.peers] : state.peers;
  return (
    <Stack as="section" gap={3} padding={4}>
      <Heading level={1}>{room.title}</Heading>
      {room.description && <Text as="p">{room.description}</Text>}
      <Text as="p">
        {t('room2d.theme', { name: t(THEMES[themeId].nameKey) })}
        {state.channel !== null && ` · ${t('room.channel', { n: state.channel })}`}
      </Text>
      <Heading level={2}>{t('room2d.people')}</Heading>
      <List>
        {people.map((p) => (
          <ListItem
            key={p.peerId}
            label={`${p.nickname}${p === state.you ? ` ${t('room2d.me')}` : ''}`}
            description={`${t(`room2d.anim.${p.a}`)} · ${t(zoneAt(themeId, p.p))}`}
          />
        ))}
      </List>
      <div aria-live="polite">
        {state.notices.map((n) => (
          <p key={n.id}>{t(n.kind === 'joined' ? 'room2d.joined' : 'room2d.left', { nickname: n.nickname })}</p>
        ))}
      </div>
    </Stack>
  );
}
