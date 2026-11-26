import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../../../assets/js/content-hub.js', import.meta.url), 'utf8');
const item = (title, publish_date, sort_order = 0) => ({ title, publish_date, sort_order });
const fixtures = [
  item('September', '2026/9/14'), item('November A', '2026/11/26'),
  item('Pinned older', '2026/7/29', '10'), item('October', '2026-10-30'),
  item('November B', '2026/11/26'), item('Invalid', '2026/11/31'),
  item('No date', ''), item('Prior year', '2025/12/31')
];

async function renderTitles(page, useFallback = false) {
  const elements = new Map();
  const window = {
    AIHUB_CONTENT_API_URL: 'https://primary.example',
    AIHUB_CONTENT_API_FALLBACK_URL: 'https://fallback.example',
    location: { href: 'https://site.example/', search: '' },
    addEventListener() {}, setTimeout, clearTimeout
  };
  const document = {
    body: { dataset: { contentType: page } },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { addEventListener() {} });
      return elements.get(id);
    },
    createElement() { return { remove() {} }; },
    head: {
      appendChild(element) {
        const url = new URL(element.src);
        if (useFallback && url.hostname === 'primary.example') element.onerror();
        else window[url.searchParams.get('callback')]({ items: fixtures });
      }
    }
  };
  runInNewContext(script, { window, document, URL, URLSearchParams });
  await new Promise(resolve => setImmediate(resolve));
  const list = elements.get('contentList');
  assert.equal(elements.get('contentCount').textContent, '8 篇已發布內容');
  return [...list.innerHTML.matchAll(/<h2>(.*?)<\/h2>/g)].map(match => match[1]);
}

test('tool reads preserve manual priority, then sort by calendar date from either API', async () => {
  const expected = ['Pinned older', 'November A', 'November B', 'October',
    'September', 'Prior year', 'Invalid', 'No date'];
  assert.deepEqual(await renderTitles('tools'), expected);
  assert.deepEqual(await renderTitles('tools', true), expected);
});

test('other content sections retain API order', async () => {
  for (const page of ['learning', 'notes']) {
    assert.deepEqual(await renderTitles(page), fixtures.map(({ title }) => title));
  }
});
