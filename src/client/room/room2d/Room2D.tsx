// screens.md S3 2D: the same room state as text. App's <main> holds it and the ChatPanel after it; reports (US7) join later.
import { Heading } from '@astryxdesign/core/Heading';
import { List, ListItem } from '@astryxdesign/core/List';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { inArena, makeArena } from '../../../core/brawl/arena.ts';
import type { BrawlMessage } from '../../../core/brawl/brawl-session.ts';
import { TUNING } from '../../../core/brawl/tuning.ts';
import type { Pose, RoomInfo } from '../../../core/room-session.ts';
import { THEMES, zoneAt, type Vec3 } from '../../../core/themes.ts';
import { ArenaSide, BrawlLog, entranceWalk } from './ArenaSide.tsx';
import { t } from '../../i18n/t.ts';
import type { RoomState } from '../../state/room-store.ts';

const ARENA = makeArena(TUNING);
type Props = {
  room: Pick<RoomInfo, 'title' | 'description' | 'roomData'>;
  state: RoomState;
  // 004 (FR-033): without these the 2D screen only shows the room (US2 fallback before joining).
  move?: (p: Vec3, r: number, a: Pose['a']) => void;
  brawl?: (msg: BrawlMessage) => void;
};

export function Room2D({ room, state, move, brawl }: Props) {
  const { themeId } = room.roomData;
  const people = state.you ? [state.you, ...state.peers] : state.peers;
  const fighting = !!state.you && inArena(ARENA, state.you.p);
  const name = (id: string) => people.find((p) => p.peerId === id)?.nickname ?? '';
  const enter = (send: NonNullable<Props['move']>) => {
    const { to, waitMs } = entranceWalk(state.you!.p, THEMES[themeId].arenaEntrance);
    setTimeout(() => send(to, 0, 'walk'), waitMs);
  };
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
            description={`${t(`room2d.anim.${p.a}`)} · ${inArena(ARENA, p.p) ? `${state.brawl.fighters[p.peerId]?.damage ?? 0}%` : t(zoneAt(themeId, p.p))}`}
          />
        ))}
      </List>
      {move && brawl && state.you && (fighting ? <ArenaSide state={state} move={move} brawl={brawl} /> : <Button label={t('brawl.enter')} onClick={() => enter(move)} />)}
      <BrawlLog brawl={state.brawl} name={name} />
      <div aria-live="polite">
        {state.notices.map((n) => (
          <p key={n.id}>{t(n.kind === 'joined' ? 'room2d.joined' : 'room2d.left', { nickname: n.nickname })}</p>
        ))}
      </div>
    </Stack>
  );
}
