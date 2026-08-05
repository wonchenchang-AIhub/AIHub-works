import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const args = process.argv.slice(2);

function argument(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

const apiBase = String(
  argument('--api') || process.env.AIHUB_D1_API_URL || process.env.AIHUB_CONTENT_API_URL || ''
).trim().replace(/\/$/, '');
const secret = String(process.env.AIHUB_INGEST_SECRET || '').trim();
const dryRun = args.includes('--dry-run');

// 類別整併後保留舊資料列，但改為 archived，避免公開 API 同時回傳新舊分類。
// 使用封存而非刪除，必要時仍可由 D1 復原歷史結構。
const retiredCategories = [
  { id: 'preset', label: 'AI工具設定', icon: '⚙️', class: 'cat-preset' },
  { id: 'ai_roles', label: '策略智囊', icon: '🧠', class: 'cat-ai-roles' },
  { id: 'comms', label: '職場溝通', icon: '💼', class: 'cat-comms' },
  { id: 'routine', label: '日常效率', icon: '📅', class: 'cat-routine' },
  { id: 'life', label: '生活娛樂', icon: '✨', class: 'cat-life' }
].map((item, index) => ({
  ...item,
  sort_order: 1000 + index,
  status: 'archived'
}));

if (!apiBase) throw new Error('缺少 D1 Worker API 網址；請使用 --api 或設定 AIHUB_D1_API_URL。');
if (!dryRun && !secret) throw new Error('缺少 AIHUB_INGEST_SECRET。');

async function loadStaticData() {
  const context = {};
  vm.createContext(context);
  const promptSource = await fs.readFile(path.join(repoRoot, 'assets/data/prompt-data.js'), 'utf8');
  const caseSource = await fs.readFile(path.join(repoRoot, 'assets/data/case-data.js'), 'utf8');
  vm.runInContext(`${promptSource}\nthis.__PROMPTS = PROMPTS; this.__CATEGORIES = CATEGORIES;`, context);
  vm.runInContext(`${caseSource}\nthis.__CASES = CASES;`, context);
  return {
    categories: Object.entries(context.__CATEGORIES).map(([id, value], index) => ({
      id,
      ...value,
      sort_order: index,
      status: 'published'
    })),
    prompts: context.__PROMPTS.map((item, index) => ({
      ...item,
      sort_order: index,
      status: 'published'
    })),
    cases: context.__CASES.map((item, index) => ({
      ...item,
      sort_order: index,
      status: 'published'
    }))
  };
}

async function post(body) {
  const response = await fetch(`${apiBase}/api/admin/sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(`D1 同步失敗（HTTP ${response.status}）：${result.error || '未知錯誤'}`);
  }
  return result;
}

async function syncEntity(entity, items) {
  for (let start = 0; start < items.length; start += 100) {
    const batch = items.slice(start, start + 100);
    await post({ action: 'sync_prompt_hub', entity, items: batch });
  }
}

function assertSourceFieldsEqual(sourceItems, remoteItems, label) {
  const remoteById = new Map(remoteItems.map((item) => [String(item.id), item]));
  if (remoteById.size !== sourceItems.length) {
    throw new Error(`${label}數量不一致：來源 ${sourceItems.length}、D1 ${remoteById.size}。`);
  }
  for (const source of sourceItems) {
    const remote = remoteById.get(String(source.id));
    if (!remote) throw new Error(`${label}缺少 ${source.id}。`);
    for (const key of Object.keys(source)) {
      if (JSON.stringify(remote[key]) !== JSON.stringify(source[key])) {
        throw new Error(`${label} ${source.id} 欄位 ${key} 不一致。`);
      }
    }
  }
}

async function verify(data) {
  const response = await fetch(`${apiBase}/api/prompt-hub?verify=${Date.now()}`, { cache: 'no-store' });
  const remote = await response.json();
  if (!response.ok || !remote.ok) throw new Error('無法讀取 D1 Prompt Hub 公開資料。');
  const remoteCategories = Object.entries(remote.categories || {}).map(([id, value]) => ({ id, ...value }));
  const sourceCategories = data.categories.map(({ sort_order, status, ...item }) => item);
  assertSourceFieldsEqual(sourceCategories, remoteCategories, '分類');
  assertSourceFieldsEqual(data.prompts, remote.prompts || [], '提示詞');
  assertSourceFieldsEqual(data.cases, remote.cases || [], '案例');
  return remote.counts;
}

const data = await loadStaticData();
console.log(`來源資料：${data.categories.length} 個分類、${data.prompts.length} 組提示詞、${data.cases.length} 則案例。`);

if (dryRun) {
  console.log(`另有 ${retiredCategories.length} 個舊分類將標記為 archived。`);
  console.log('Dry run 完成，未寫入 D1。');
} else {
  await syncEntity('categories', data.categories);
  await syncEntity('categories', retiredCategories);
  await syncEntity('prompts', data.prompts);
  await syncEntity('cases', data.cases);
  const counts = await verify(data);
  console.log(`D1 驗證完成：${counts.categories} 個分類、${counts.prompts} 組提示詞、${counts.cases} 則案例。`);
}
