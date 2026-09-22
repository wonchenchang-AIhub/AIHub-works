const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/prompt-hub.js'), 'utf8').replace(/\r\n/g, '\n');
const context = { console, assert };
vm.createContext(context);
for (const name of ['prompt-data', 'case-data']) {
  vm.runInContext(fs.readFileSync(path.join(root, `assets/data/${name}.js`), 'utf8'), context);
}
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 2);
}
vm.runInContext('let activePrompts = PROMPTS; let currentModalId = 191; let __modalCaseCache = [];', context);
vm.runInContext(extract('buildCaseCopyText'), context);
vm.runInContext(`
for (const c of CASES) for (const id of c.promptIds) {
  const parent = PROMPTS.find(p => Number(p.id) === Number(id));
  const text = buildCaseCopyText(id, c.prompt);
  assert(text.includes(parent.content), c.id);
  assert(text.endsWith(c.prompt), c.id);
  assert(text.includes('以主模組為準並指出差異'), c.id);
}
assert.equal(buildCaseCopyText(-1, 'case'), '');
assert.equal(buildCaseCopyText(191, ''), '');
activePrompts = [{id:191, title:'Updated', content:'LIVE UPDATED RULES'}];
assert(buildCaseCopyText(191, 'input').includes('LIVE UPDATED RULES'));
activePrompts = PROMPTS;
`, context);
// Both modal actions use the same cache; the secondary action must remain verbatim.
context.doCaseCopy = text => { context.copied = text; };
vm.runInContext(extract('modalCopyCase'), context);
vm.runInContext(`__modalCaseCache = ['CASE ONLY']; modalCopyCase({}, 0, true);`, context);
assert.equal(context.copied, 'CASE ONLY');
vm.runInContext('modalCopyCase({}, 0);', context);
assert(context.copied.includes('【主模組：'));
assert(context.copied.endsWith('CASE ONLY'));
// Card actions must resolve data-case-index rather than the button position (two per case).
assert(source.includes('cases[Number(caseButton.dataset.caseIndex)]'));
assert(source.includes("caseButton.dataset.copyMode === 'case' ? text : buildCaseCopyText(id, text)"));
// Clipboard success/failure: restore the exact original button label, no false success.
vm.runInContext(extract('doCaseCopy'), context);
let toasts = [], timers = [];
context.showToast = text => toasts.push(text);
context.setTimeout = callback => timers.push(callback);
context.navigator = { clipboard: { writeText: async text => { context.clipboard = text; } } };
const button = () => ({textContent:'只複製案例資料', disabled:false, classList:{add(){},remove(){}}});
(async () => {
  const btn = button();
  context.doCaseCopy('payload', btn);
  await new Promise(setImmediate);
  assert.equal(context.clipboard, 'payload');
  assert.equal(btn.textContent, '✓ 已複製');
  timers.forEach(callback => callback());
  assert.equal(btn.textContent, '只複製案例資料');
  assert.equal(btn.disabled, false);
  toasts = [];
  context.console = { error(){} };
  context.navigator.clipboard.writeText = async () => { throw Error('denied'); };
  context.doCaseCopy('payload', btn);
  await new Promise(setImmediate);
  assert.equal(btn.disabled, false);
  assert(toasts.every(t => !t.includes('✓')));
  console.log('PASS: all 540 case combinations, current parent lookup, modal modes, card wiring, clipboard success/failure and label reset');
})().catch(error => { console.error(error); process.exitCode = 1; });
