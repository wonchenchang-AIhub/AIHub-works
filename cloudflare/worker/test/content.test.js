import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeContentItem,
  normalizeFeatured,
  normalizeStatus,
  normalizeType
} from '../src/index.js';

test('maps the three Chinese content types', () => {
  assert.equal(normalizeType({ content_type: 'AI 教學簡報' }), 'learning');
  assert.equal(normalizeType({ content_type: 'AI 工具選讀' }), 'tools');
  assert.equal(normalizeType({ content_type: 'AI 實作筆記' }), 'notes');
});

test('accepts normalized type values', () => {
  assert.equal(normalizeType({ type: 'TOOLS' }), 'tools');
});

test('defaults invalid status to draft', () => {
  assert.equal(normalizeStatus('published'), 'published');
  assert.equal(normalizeStatus('公開'), 'draft');
});

test('normalizes featured values used by Google Sheets', () => {
  assert.equal(normalizeFeatured('yes'), 1);
  assert.equal(normalizeFeatured('是'), 1);
  assert.equal(normalizeFeatured('no'), 0);
});

test('preserves arbitrary content fields in the JSON payload', () => {
  const value = normalizeContentItem({
    content_id: 'LEARN-1',
    content_type: 'AI 教學簡報',
    status: 'published',
    title: '測試簡報',
    pdf_file: 'https://example.com/slide.pdf',
    learning_topics: '提示詞設計'
  });
  const payload = JSON.parse(value.payloadJson);
  assert.equal(value.normalizedType, 'learning');
  assert.equal(payload.pdf_file, 'https://example.com/slide.pdf');
  assert.equal(payload.learning_topics, '提示詞設計');
});

test('rejects rows without stable IDs or titles', () => {
  assert.throws(() => normalizeContentItem({ content_type: 'AI 工具選讀', title: '缺編號' }), /內容編號/);
  assert.throws(() => normalizeContentItem({ content_id: 'TOOL-1', content_type: 'AI 工具選讀' }), /內容標題/);
});
