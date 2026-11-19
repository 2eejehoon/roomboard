// screens.md S3 공통 영역 and S6, the 3D body (T045), the 2D body and the 3D↔2D switch (T054, T056), chat (T073).
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { CHANNEL_CAPACITY } from '../../core/channels.ts';
import { CLOSE } from '../../core/protocol.ts';
import { navigate } from '../App.tsx';
import { BugReportDialog } from '../bug/BugReportDialog.tsx';
import { setRoomView } from '../bug/collector.ts';
import { deviceKey, readShake, readView, saveShake, saveView, type View } from '../device.ts';
import { t } from '../i18n/t.ts';
import { openRoomSocket, type RoomSocket } from '../net/room-socket.ts';
import { RoomStore, type RoomState } from '../state/room-store.ts';
import type { RoomInfo } from '../../core/room-session.ts';
import { Loading, NetworkError } from '../Status.tsx';
import { installTestHooks } from '../test-hooks.ts';
import { ChatPanel } from './ChatPanel.tsx';
import { ReportDialog } from './ReportDialog.tsx';
import { fighting } from './room2d/ArenaSide.tsx';
import { Room2D } from './room2d/Room2D.tsx';
import type { BrawlMessage } from '../../core/brawl/brawl-session.ts';
import { serverNow } from '../brawl/store.ts';
import { TUNING } from '../../core/brawl/tuning.ts';
import { hasWebGL, initialView } from './webgl.ts';

const Scene = lazy(() => import('./room3d/Scene.tsx'));

type RoomText = Pick<RoomInfo, 'title' | 'description' | 'roomData'>;
type Load = { status: 'loading' | 'error' } | { status: 404 | 410 } | { status: 'ok'; room: RoomText };

export function RoomPage({ id }: { id: string }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [store] = useState(() => new RoomStore());
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const socket = useRef<RoomSocket | null>(null);
  const move = useCallback<RoomSocket['move']>((p, r, a, d) => socket.current?.move(p, r, a, d), []);
  const chat = useCallback((text: string) => socket.current?.chat(text), []);
  const brawl = useCallback<RoomSocket['brawl']>((msg) => socket.current?.brawl(msg), []);
  const [webgl] = useState(hasWebGL);
  const [view, setView] = useState<View>(() => initialView(readView(), webgl));
  useEffect(() => {
    setRoomView(view);
    return () => setRoomView(null);
  }, [view]);
  const [failed3d, setFailed3d] = useState(false);
  // Only a click is saved (precedent 2026-11-07-2d-view-rules); a failed 3D load falls back to 2D for this visit.
  const switchView = () => {
    const next = view === '3d' ? '2d' : '3d';
    saveView(next);
    setView(next);
    setFailed3d(false);
  };

  useEffect(() => {
    let live = true;
    fetch(`/api/rooms/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!live) return;
        if (res.status === 404 || res.status === 410) return setLoad({ status: res.status });
        if (!res.ok) return setLoad({ status: 'error' });
        setLoad({ status: 'ok', room: (await res.json()) as RoomText });
      })
      .catch(() => live && setLoad({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [id, attempt]);

  const ready = load.status === 'ok';
  useEffect(() => {
    if (!ready) return;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${encodeURIComponent(id)}/ws`;
    const roomGone = () => fetch(`/api/rooms/${encodeURIComponent(id)}`).then((res) => res.status === 404 || res.status === 410);
    const s = (socket.current = openRoomSocket({ url, deviceKey: deviceKey(), store, roomGone }));
    installTestHooks(store, s);
    return () => s.close();
  }, [ready, id, store]);

  if (load.status === 'loading') return <Loading />;
  if (load.status === 'error') return <NetworkError onRetry={() => setAttempt((n) => n + 1)} />;
  if (load.status !== 'ok') return <Notice text={t(load.status === 404 ? 'room.notFound' : 'room.gone')} />;
  if (state.connection === 'closed' && state.closeCode !== null) return <ClosedNotice code={state.closeCode} />;
  const room = state.room ?? load.room;
  return (
    <>
      <RoomHeader id={id} title={room.title} state={state} view={view} onSwitch={webgl ? switchView : undefined} brawl={brawl} />
      {view === '3d' ? (
        <SceneBoundary
          onError={() => {
            setView('2d');
            setFailed3d(true);
          }}
        >
          <Suspense fallback={<Loading />}>
            <Scene store={store} move={move} brawl={brawl} />
          </Suspense>
        </SceneBoundary>
      ) : (
        <>
          {failed3d && (
            <div role="status">
              <Banner status="info" title={t('room2d.fallback')} />
            </div>
          )}
          <Room2D room={room} state={state} move={move} brawl={brawl} />
        </>
      )}
      <ChatPanel roomId={id} state={state} send={chat} view={view} />
    </>
  );
}

// If the 3D chunk, WebGL or an asset fails, the room keeps its header and connection and RoomPage switches to 2D.
class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError = () => ({ failed: true });
  componentDidCatch = () => this.props.onError();
  render = () => (this.state.failed ? null : this.props.children);
}

// Final close codes (websocket.md 닫힘 코드 표): no reconnect, so say what happened instead of a room that looks live.
export function ClosedNotice({ code }: { code: number }) {
  // screens.md S3 방이 삭제됨: the modal is the whole page, since nothing behind it is live any more.
  if (code === CLOSE.roomDeleted) {
    return (
      <Stack role="alertdialog" aria-modal="true" aria-labelledby="room-deleted" gap={4} padding={4}>
        <Text as="p" id="room-deleted">
          {t('room.deleted')}
        </Text>
        <Button label={t('room.ok')} onClick={() => navigate('/')} />
      </Stack>
    );
  }
  return <Notice text={t(code === CLOSE.unsupportedVersion ? 'room.outdated' : 'room.ended')} reload />;
}

export function Notice({ text, reload = false }: { text: string; reload?: boolean }) {
  return (
    <div role="alert">
      <Banner
        status="warning"
        title={text}
        endContent={<Button label={t(reload ? 'room.reload' : 'room.toBoard')} variant="secondary" onClick={() => (reload ? location.reload() : navigate('/'))} />}
      />
    </div>
  );
}

// onSwitch is absent without WebGL: there is no 3D to switch to. brawl is absent before joining (the US2 2D fallback).
type HeaderProps = { id?: string; title: string; state: RoomState; view?: View; onSwitch?: () => void; brawl?: (msg: BrawlMessage) => void };
export function RoomHeader({ id, title, state, view, onSwitch, brawl }: HeaderProps) {
  const [reporting, setReporting] = useState(false);
  const [bugging, setBugging] = useState(false);
  const [shake, setShake] = useState(readShake);
  return (
    // 003 FR-006: its own light surface, the same as the chat's, so it reads over a dark 3D sky too.
    <Stack as="header" gap={2} padding={4} style={{ background: 'rgb(255 255 255 / 0.85)' }}>
      {state.connection === 'reconnecting' && (
        <div role="status">
          <Banner status="warning" title={t('room.reconnecting')} />
        </div>
      )}
      <Stack direction="horizontal" gap={3} vAlign="center" wrap="wrap">
        <Text as="p" weight="bold">
          {title}
        </Text>
        {state.channel !== null && (
          <Text as="p">
            {t('room.channel', { n: state.channel })} · {t('room.people', { n: state.peers.length + 1, max: CHANNEL_CAPACITY })}
          </Text>
        )}
        {state.you && <Text as="p">{t('room.you', { nickname: state.you.nickname })}</Text>}
        {onSwitch && <Button label={t(view === '3d' ? 'room.view2d' : 'room.view3d')} variant="secondary" onClick={onSwitch} />}
        {/* 004 FR-023: only the 3D view shakes; the choice stays on this device. */}
        {view === '3d' && (
          <Button
            label={t(shake ? 'brawl.shakeOff' : 'brawl.shakeOn')}
            variant="secondary"
            onClick={() => {
              saveShake(!shake);
              setShake(!shake);
            }}
          />
        )}
        {id && <Button label={t('report.room')} variant="secondary" onClick={() => setReporting(true)} />}
        {view && <Button label={t('bug.open')} variant="secondary" onClick={() => setBugging(true)} />}
        {id && <Link href={`/rooms/${id}/edit`}>{t('room.edit')}</Link>}
      </Stack>
      {brawl && <MatchBar state={state} brawl={brawl} />}
      {id && reporting && <ReportDialog target={{ type: 'room', roomId: id }} onClose={() => setReporting(false)} />}
      {view && bugging && <BugReportDialog context={{ view, themeId: state.room?.roomData.themeId, connection: state.connection }} onClose={() => setBugging(false)} />}
    </Stack>
  );
}

// 004 US4 (FR-025~027), in the header so the 3D and 2D views both show it: the start from the arena, then the time left and
// everyone's stocks, then the last ranks until the next start. The 2D live log reads the start and the end aloud (BrawlLog).
function MatchBar({ state, brawl }: { state: RoomState; brawl: (msg: BrawlMessage) => void }) {
  const { match, result } = state.brawl;
  const [now, setNow] = useState(Date.now);
  const running = !!match;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  const people = state.you ? [state.you, ...state.peers] : state.peers;
  const name = (peerId: string) => people.find((p) => p.peerId === peerId)?.nickname || t('match.gone');
  if (match) {
    // now is up to a second old (the last tick, or the mount before a start), so a start shows the full limit, not more.
    const ms = Math.min(TUNING.match.limitMs, match.endsAt - serverNow(state.brawl, now));
    const left = Math.max(0, Math.ceil(ms / 1000));
    const time = t('match.time', { m: Math.floor(left / 60), s: String(left % 60).padStart(2, '0') });
    return <Text as="p">{[time, ...match.players.map((p) => t('match.stocks', { name: name(p.peerId), n: p.stocks }))].join(' · ')}</Text>;
  }
  // The server starts a match only from the arena with two or more there (FR-025).
  const canStart = !!state.you && fighting(state.brawl, state.you) && people.filter((p) => fighting(state.brawl, p)).length >= 2;
  return (
    <>
      {result && <Text as="p">{`${t('match.result')}: ${result.map((r) => t('match.rank', { rank: r.rank, name: name(r.peerId) })).join(', ')}`}</Text>}
      {canStart && <Button label={t('match.start')} onClick={() => brawl({ t: 'match_start' })} />}
    </>
  );
}
