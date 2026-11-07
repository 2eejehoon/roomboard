import { expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';

// T012 / research R8: CPU time of injecting <title>, <meta name="description"> and <noscript> into index.html with HTMLRewriter.
// workerd timers have 1 ms resolution, so the time is averaged over many runs.
const RUNS = 200;
const title = '작은 카페 <script>alert(1)</script>';
const description = '쉬어 가는 방'.repeat(30);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);
const inject = (html: string) =>
  new HTMLRewriter()
    .on('title', { element: (e) => void e.setInnerContent(title) })
    .on('head', { element: (e) => void e.append(`<meta name="description" content="${esc(description)}">`, { html: true }) })
    .on('body', { element: (e) => void e.prepend(`<noscript>${esc(title)}\n${esc(description)}</noscript>`, { html: true }) })
    .transform(new Response(html, { headers: { 'content-type': 'text/html' } }))
    .text();

it('HTMLRewriter injection into index.html; prints the mean time per request', async () => {
  const out = await inject(indexHtml);
  expect(out).toContain('<title>작은 카페 &lt;script&gt;alert(1)&lt;/script&gt;</title>');
  expect(out).toMatch(/<meta name="description" content="(쉬어 가는 방){30}">/);
  expect(out).toContain('<noscript>작은 카페 &lt;script&gt;');
  const start = performance.now();
  for (let i = 0; i < RUNS; i++) await inject(indexHtml);
  const total = performance.now() - start;
  console.log(`perf-html: ${RUNS} runs ${total} ms, mean ${total / RUNS} ms`);
  expect(total, 'timer must advance or the number means nothing').toBeGreaterThan(0);
});
