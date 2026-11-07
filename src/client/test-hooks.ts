// E2E-only state access (contracts/websocket.md "개발 빌드 전용 테스트 훅"). import.meta.env.DEV is false in production builds,
// so the whole branch and the hook name drop out of the bundle (npm run check:bundle).
import type { RoomSocket } from './net/room-socket.ts';
import type { RoomStore } from './state/room-store.ts';

export function installTestHooks(store: RoomStore, socket: RoomSocket): void {
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__roomboard = {
      state: store.getState,
      move: (p: [number, number, number], r: number) => socket.move(p, r, 'walk'),
    };
  }
}
