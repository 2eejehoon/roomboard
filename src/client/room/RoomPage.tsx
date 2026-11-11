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
import { deviceKey, readView, saveView, type View } from '../device.ts';
import { t } from '../i18n/t.ts';
import { openRoomSocket, type RoomSocket } from '../net/room-socket.ts';
import { RoomStore, type RoomState } from '../state/room-store.ts';
import type { RoomInfo } from '../../core/room-session.ts';
import { Loading, NetworkError } from '../Status.tsx';
import { installTestHooks } from '../test-hooks.ts';
import { ChatPanel } from './ChatPanel.tsx';
import { ReportDialog } from './ReportDialog.tsx';
import { Room2D } from './room2d/Room2D.tsx';
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
  const move = useCallback<RoomSocket['move']>((p, r, a) => socket.current?.move(p, r, a), []);
  const chat = useCallback((text: string) => socket.current?.chat(text), []);
  const [webgl] = useState(hasWebGL);
  const [view, setView] = useState<View>(() => initialView(readView(), webgl));
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
      <RoomHeader id={id} title={room.title} state={state} view={view} onSwitch={webgl ? switchView : undefined} />
      {view === '3d' ? (
        <SceneBoundary
          onError={() => {
            setView('2d');
            setFailed3d(true);
          }}
        >
          <Suspense fallback={<Loading />}>
            <Scene store={store} move={move} />
          </Suspense>
        </SceneBoundary>
      ) : (
        <>
          {failed3d && (
            <div role="status">
              <Banner status="info" title={t('room2d.fallback')} />
            </div>
          )}
          <Room2D room={room} state={state} />
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

// onSwitch is absent without WebGL: there is no 3D to switch to.
export function RoomHeader({ id, title, state, view, onSwitch }: { id?: string; title: string; state: RoomState; view?: View; onSwitch?: () => void }) {
  const [reporting, setReporting] = useState(false);
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
        {id && <Button label={t('report.room')} variant="secondary" onClick={() => setReporting(true)} />}
        {id && <Link href={`/rooms/${id}/edit`}>{t('room.edit')}</Link>}
      </Stack>
      {id && reporting && <ReportDialog target={{ type: 'room', roomId: id }} onClose={() => setReporting(false)} />}
    </Stack>
  );
}
