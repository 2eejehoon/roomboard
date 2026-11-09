// screens.md S3 공통 영역 and S6, the 3D body (T045), the 2D body and the 3D↔2D switch (T054, T056), chat (T073).
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
    const s = (socket.current = openRoomSocket({ url, deviceKey: deviceKey(), store }));
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
      <RoomHeader title={room.title} state={state} view={view} onSwitch={webgl ? switchView : undefined} />
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
          {failed3d && <p role="status">{t('room2d.fallback')}</p>}
          <Room2D room={room} state={state} />
        </>
      )}
      <ChatPanel state={state} send={chat} view={view} />
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
  if (code === CLOSE.roomDeleted) return <Notice text={t('room.gone')} />;
  return <Notice text={t(code === CLOSE.unsupportedVersion ? 'room.outdated' : 'room.ended')} reload />;
}

function Notice({ text, reload = false }: { text: string; reload?: boolean }) {
  return (
    <div role="alert">
      <p>{text}</p>
      <button type="button" onClick={() => (reload ? location.reload() : navigate('/'))}>
        {t(reload ? 'room.reload' : 'room.toBoard')}
      </button>
    </div>
  );
}

// onSwitch is absent without WebGL: there is no 3D to switch to.
export function RoomHeader({ title, state, view, onSwitch }: { title: string; state: RoomState; view?: View; onSwitch?: () => void }) {
  return (
    <header>
      {state.connection === 'reconnecting' && <p role="status">{t('room.reconnecting')}</p>}
      <p>{title}</p>
      {state.channel !== null && (
        <p>
          {t('room.channel', { n: state.channel })} · {t('room.people', { n: state.peers.length + 1, max: CHANNEL_CAPACITY })}
        </p>
      )}
      {state.you && <p>{t('room.you', { nickname: state.you.nickname })}</p>}
      {onSwitch && (
        <button type="button" onClick={onSwitch}>
          {t(view === '3d' ? 'room.view2d' : 'room.view3d')}
        </button>
      )}
    </header>
  );
}
