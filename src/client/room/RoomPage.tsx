// screens.md S3 공통 영역 and S6. The 3D/2D bodies come with their stories (T045~, T054).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { CHANNEL_CAPACITY } from '../../core/channels.ts';
import { navigate } from '../App.tsx';
import { deviceKey } from '../device.ts';
import { t } from '../i18n/t.ts';
import { openRoomSocket } from '../net/room-socket.ts';
import { RoomStore, type RoomState } from '../state/room-store.ts';
import { Loading, NetworkError } from '../Status.tsx';
import { installTestHooks } from '../test-hooks.ts';

type Load = { status: 'loading' | 'error' } | { status: 404 | 410 } | { status: 'ok'; title: string };

export function RoomPage({ id }: { id: string }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [store] = useState(() => new RoomStore());
  const state = useSyncExternalStore(store.subscribe, store.getState);

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
    const socket = openRoomSocket({ url, deviceKey: deviceKey(), store });
    installTestHooks(store, socket);
    return () => socket.close();
  }, [ready, id, store]);

  if (load.status === 'loading') return <Loading />;
  if (load.status === 'error') return <NetworkError onRetry={() => setAttempt((n) => n + 1)} />;
  if (load.status !== 'ok') {
    return (
      <div role="alert">
        <p>{t(load.status === 404 ? 'room.notFound' : 'room.gone')}</p>
        <button type="button" onClick={() => navigate('/')}>
          {t('room.toBoard')}
        </button>
      </div>
    );
  }
  return <RoomHeader title={state.room?.title ?? load.title} state={state} />;
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
