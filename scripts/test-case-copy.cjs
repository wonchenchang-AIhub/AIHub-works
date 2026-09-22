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
vm.runInContext(extract('buildCaseContext'), context);
vm.runInContext(extract('buildCaseCopyText'), context);
vm.runInContext(`
for (const c of CASES) for (const id of c.promptIds) {
  const parent = PROMPTS.find(p => Number(p.id) === Number(id));
  const caseContext = buildCaseContext(c);
  const text = buildCaseCopyText(id, caseContext);
  assert(text.includes(parent.content), c.id);
  assert(text.endsWith(caseContext), c.id);
  assert(!text.includes(c.prompt), c.id);
  assert(caseContext.includes(c.title), c.id);
  if (c.scene) assert(caseContext.includes(c.scene), c.id);
  if (c.prep) assert(caseContext.includes(c.prep), c.id);
  assert(text.includes('請完全依照上方主模組執行'), c.id);
}
assert.equal(buildCaseCopyText(-1, 'case'), '');
assert.equal(buildCaseCopyText(191, ''), '');
assert.equal(buildCaseContext(null), '');
activePrompts = [{id:191, title:'Updated', content:'LIVE UPDATED RULES'}];
assert(buildCaseCopyText(191, 'input').includes('LIVE UPDATED RULES'));
activePrompts = PROMPTS;
`, context);
// Both modal actions use the same simplified context; the secondary action omits the parent module.
context.doCaseCopy = text => { context.copied = text; };
vm.runInContext(extract('modalCopyCase'), context);
vm.runInContext(`__modalCaseCache = ['CASE ONLY']; modalCopyCase({}, 0, true);`, context);
assert.equal(context.copied, 'CASE ONLY');
vm.runInContext('modalCopyCase({}, 0);', context);
assert(context.copied.includes('【主模組：'));
assert(context.copied.endsWith('CASE ONLY'));
// Card actions must resolve data-case-index rather than the button position (two per case).
assert(source.includes('cases[Number(caseButton.dataset.caseIndex)]'));
assert(source.includes("caseButton.dataset.copyMode === 'case' ? context : buildCaseCopyText(id, context)"));
// Clipboard success/failure: restore the exact original button label, no false success.
vm.runInContext(extract('doCaseCopy'), context);
let toasts = [], timers = [];
context.showToast = text => toasts.push(text);
context.setTimeout = callback => timers.push(callback);
context.navigator = { clipboard: { writeText: async text => { context.clipboard = text; } } };
const button = () => ({textContent:'只複製案例情境', disabled:false, classList:{add(){},remove(){}}});
(async () => {
  const btn = button();
  context.doCaseCopy('payload', btn);
  await new Promise(setImmediate);
  assert.equal(context.clipboard, 'payload');
  assert.equal(btn.textContent, '✓ 已複製');
  timers.forEach(callback => callback());
  assert.equal(btn.textContent, '只複製案例情境');
  assert.equal(btn.disabled, false);
  toasts = [];
  context.console = { error(){} };
  context.navigator.clipboard.writeText = async () => { throw Error('denied'); };
  context.doCaseCopy('payload', btn);
  await new Promise(setImmediate);
  assert.equal(btn.disabled, false);
  assert(toasts.every(t => !t.includes('✓')));
  console.log('PASS: all 540 simplified case contexts omit legacy answer prompts; parent lookup, modal modes, card wiring and clipboard states verified');
})().catch(error => { console.error(error); process.exitCode = 1; });
