// screens.md S3 공통 영역 and S6, and the 3D body (T045). The 2D body and the 3D↔2D switch come with US2 (T054, T056).
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { CHANNEL_CAPACITY } from '../../core/channels.ts';
import { CLOSE } from '../../core/protocol.ts';
import { navigate } from '../App.tsx';
import { deviceKey } from '../device.ts';
import { t } from '../i18n/t.ts';
import { openRoomSocket, type RoomSocket } from '../net/room-socket.ts';
import { RoomStore, type RoomState } from '../state/room-store.ts';
import { Loading, NetworkError } from '../Status.tsx';
import { installTestHooks } from '../test-hooks.ts';

const Scene = lazy(() => import('./room3d/Scene.tsx'));

type Load = { status: 'loading' | 'error' } | { status: 404 | 410 } | { status: 'ok'; title: string };

export function RoomPage({ id }: { id: string }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [store] = useState(() => new RoomStore());
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const socket = useRef<RoomSocket | null>(null);
  const move = useCallback<RoomSocket['move']>((p, r, a) => socket.current?.move(p, r, a), []);

  useEffect(() => {
    let live = true;
    fetch(`/api/rooms/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!live) return;
        if (res.status === 404 || res.status === 410) return setLoad({ status: res.status });
        if (!res.ok) return setLoad({ status: 'error' });
        setLoad({ status: 'ok', title: ((await res.json()) as { title: string }).title });
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
  return (
    <>
      <RoomHeader title={state.room?.title ?? load.title} state={state} />
      <SceneBoundary>
        <Suspense fallback={<Loading />}>
          <Scene store={store} move={move} />
        </Suspense>
      </SceneBoundary>
    </>
  );
}

// Without WebGL, or if the 3D chunk or an asset fails, the room keeps its header and connection. US2 switches to 2D here (T056).
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError = () => ({ failed: true });
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

export function RoomHeader({ title, state }: { title: string; state: RoomState }) {
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
      {/* 3D↔2D switch: T056 */}
    </header>
  );
}
