import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Link, matchRoute, navigate } from '../../src/client/App.tsx';
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

// PR #32 review: LinkProvider makes this Link render every Astryx link, so it must leave anything but a plain in-app click to
// the browser and keep the caller's onClick.
describe('Link', () => {
  const click = (props: Parameters<typeof Link>[0], over: Partial<{ button: number; metaKey: boolean; defaultPrevented: boolean }> = {}) => {
    const pushState = vi.fn();
    vi.stubGlobal('history', { pushState });
    vi.stubGlobal('dispatchEvent', () => true);
    vi.stubGlobal('PopStateEvent', class extends Event {});
    vi.stubGlobal('location', { origin: 'https://roomboard.test', href: 'https://roomboard.test/' });
    const e = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...over, preventDefault: vi.fn() };
    (Link(props) as { props: { onClick: (e: unknown) => void } }).props.onClick(e);
    vi.unstubAllGlobals();
    return { navigated: pushState.mock.calls.length > 0, prevented: e.preventDefault.mock.calls.length > 0 };
  };

  it('a plain click on an in-app path navigates without a page load', () => {
    expect(click({ href: '/new' })).toEqual({ navigated: true, prevented: true });
  });

  it('runs the onClick it was given, and leaves the click alone if that prevented it', () => {
    const onClick = vi.fn();
    click({ href: '/new', onClick });
    expect(onClick).toHaveBeenCalledOnce();
    expect(click({ href: '/new' }, { defaultPrevented: true })).toEqual({ navigated: false, prevented: false });
  });

  it.each([
    ['another origin', { href: 'https://example.com/x' }],
    ['a target', { href: '/new', target: '_blank' }],
  ])('leaves %s to the browser', (_, props) => {
    expect(click(props)).toEqual({ navigated: false, prevented: false });
  });

  it('leaves a modified click (new tab) to the browser', () => {
    expect(click({ href: '/new' }, { metaKey: true })).toEqual({ navigated: false, prevented: false });
  });
});
