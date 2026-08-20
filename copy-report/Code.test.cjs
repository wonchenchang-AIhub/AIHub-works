const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {
  console,
  Set,
  Date,
  Number,
  Object,
  Array,
  String,
  RegExp,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('copy-report/Code.gs', 'utf8'), context);

const columns = {
  responseTime: 0,
  sourceSite: 1,
  promptId: 2,
  promptTitle: 3,
  category: 4,
  copiedAt: 5,
};

const copied = context.toCopyRecord_(
  ['2026-08-20', 'AIHub-works', '177', '測試提示詞', '工具與效率', '2026-08-20T01:00:00Z'],
  columns
);
const viewed = context.toCopyRecord_(
  ['2026-08-20', 'AIHub-works:tools:content-view', 'CONTENT_VIEW:tools:TOOL-1', '測試文章', 'AI 工具選讀', '2026-08-20T02:00:00Z'],
  columns
);

assert.equal(copied.eventType, 'prompt_copy');
assert.equal(viewed.eventType, 'content_view');

const contentTypes = context.mergeContentViewCounts_(
  { 'AI 教學簡報': 1, 'AI 工具選讀': 2 },
  { 'AI 教學簡報': 3, 'AI 工具選讀': 4, 'AI 實作筆記': 5 },
  3
);
assert.equal(contentTypes.length, 3);
assert.equal(contentTypes[1].periodShare, 2 / 3);
assert.equal(contentTypes[2].periodCount, 0);

const text = context.buildTextBody_({
  period: '2026/08/19 07:00 ～ 2026/08/20 07:00',
  totalCopies: 10,
  periodCopies: 1,
  sources: [],
  categories: [],
  topPrompts: [],
  totalViews: 12,
  periodViews: 3,
  contentTypes,
  topContent: [{ title: '測試文章', category: 'AI 工具選讀', count: 2 }],
});
assert.match(text, /三個內容區累計點閱：12/);
assert.match(text, /AI 工具選讀.*66\.7%/);
assert.match(text, /測試文章（2 次）/);

console.log('copy-report tests OK');
