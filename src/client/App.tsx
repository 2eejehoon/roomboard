import { useSyncExternalStore, type ComponentProps } from 'react';
import { BoardPage } from './board/BoardPage.tsx';
import { CreateRoomPage } from './board/CreateRoomPage.tsx';
import { EditRoomPage } from './board/EditRoomPage.tsx';
import { RoomPage } from './room/RoomPage.tsx';

// Routes from contracts/screens.md. A dozen lines of history routing instead of a router dependency (not in research R1).
export type Route =
  | { name: 'board' | 'create' | 'admin' | 'notFound' }
  | { name: 'room' | 'edit'; id: string };

export function matchRoute(path: string): Route {
  if (path === '/') return { name: 'board' };
  if (path === '/new') return { name: 'create' };
  if (path === '/admin') return { name: 'admin' };
  const room = /^\/rooms\/([^/]+)(\/edit)?$/.exec(path);
  if (room) return { name: room[2] ? 'edit' : 'room', id: room[1] };
  return { name: 'notFound' };
}

// pushState fires no popstate, so in-app moves announce themselves the same way back/forward does.
export function navigate(path: string): void {
  history.pushState(null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}

// An <a> that moves inside the app; modified clicks (new tab, etc.) keep the browser's behaviour.
export const Link = ({ href, ...rest }: ComponentProps<'a'> & { href: string }) => (
  <a
    href={href}
    {...rest}
    onClick={(e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(href);
    }}
  />
);

const subscribe = (onChange: () => void) => {
  addEventListener('popstate', onChange);
  return () => removeEventListener('popstate', onChange);
};

export function App() {
  const route = matchRoute(useSyncExternalStore(subscribe, () => location.pathname));
  // Each story fills in its screen (S1~S6); until then the route only marks the page.
  return (
    <main data-route={route.name}>
      {route.name === 'board' && <BoardPage />}
      {route.name === 'create' && <CreateRoomPage />}
      {route.name === 'room' && <RoomPage key={route.id} id={route.id} />}
      {route.name === 'edit' && <EditRoomPage key={route.id} id={route.id} />}
    </main>
  );
}
