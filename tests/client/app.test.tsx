import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { matchRoute, navigate } from '../../src/client/App.tsx';
import { Loading, NetworkError, RateLimited } from '../../src/client/Status.tsx';

describe('matchRoute (screens.md 화면 목록)', () => {
  it.each([
    ['/', { name: 'board' }],
    ['/new', { name: 'create' }],
    ['/rooms/aB3dE5fG7h', { name: 'room', id: 'aB3dE5fG7h' }],
    ['/rooms/aB3dE5fG7h/edit', { name: 'edit', id: 'aB3dE5fG7h' }],
    ['/admin', { name: 'admin' }],
    ['/rooms/', { name: 'notFound' }],
    ['/rooms/a/b/c', { name: 'notFound' }],
    ['/nope', { name: 'notFound' }],
  ])('%s', (path, route) => {
    expect(matchRoute(path)).toEqual(route);
  });
});

describe('navigate', () => {
  it('pushes the path and tells route subscribers, which pushState alone does not', () => {
    const pushState = vi.fn();
    const events: string[] = [];
    vi.stubGlobal('history', { pushState });
    vi.stubGlobal('dispatchEvent', (e: Event) => events.push(e.type));
    vi.stubGlobal('PopStateEvent', class extends Event {});
    navigate('/rooms/aB3dE5fG7h');
    expect(pushState).toHaveBeenCalledWith(null, '', '/rooms/aB3dE5fG7h');
    expect(events).toEqual(['popstate']);
    vi.unstubAllGlobals();
  });
});

describe('common states (screens.md 공통 상태)', () => {
  it('loading is a status message', () => {
    expect(renderToStaticMarkup(<Loading />)).toMatch(/role="status".*불러오는 중/);
  });

  it('network error has a retry button', () => {
    const html = renderToStaticMarkup(<NetworkError onRetry={() => {}} />);
    expect(html).toContain('연결에 문제가 있어요');
    expect(html).toMatch(/<button[^>]*>다시 시도<\/button>/);
  });

  it('429 shows seconds rounded up from retryAfterMs', () => {
    expect(renderToStaticMarkup(<RateLimited retryAfterMs={2100} />)).toContain('잠시 후 다시 시도해 주세요 (3초)');
  });
});
