import { useSyncExternalStore } from 'react';

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

const subscribe = (onChange: () => void) => {
  addEventListener('popstate', onChange);
  return () => removeEventListener('popstate', onChange);
};

export function App() {
  const route = matchRoute(useSyncExternalStore(subscribe, () => location.pathname));
  // Each story fills in its screen (S1~S6); until then the route only marks the page.
  return <main data-route={route.name} />;
}
