const TYPE_MAP = Object.freeze({
  'AI 教學簡報': 'learning',
  'AI 工具選讀': 'tools',
  'AI 實作筆記': 'notes'
});

const CONTENT_TYPE_MAP = Object.freeze({
  learning: 'AI 教學簡報',
  tools: 'AI 工具選讀',
  notes: 'AI 實作筆記'
});

const VALID_TYPES = new Set(Object.keys(CONTENT_TYPE_MAP));
const VALID_STATUSES = new Set(['draft', 'published', 'archived']);
const MAX_SYNC_ITEMS = 100;
const MAX_BODY_BYTES = 1024 * 1024;
const PROMPT_HUB_ENTITIES = new Set(['categories', 'prompts', 'cases']);

function text(value, maxLength = 10000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeType(item) {
  const direct = text(item.type, 40).toLowerCase();
  if (VALID_TYPES.has(direct)) return direct;
  return TYPE_MAP[text(item.content_type, 100)] || '';
}

function normalizeStatus(value) {
  const status = text(value, 20).toLowerCase();
  return VALID_STATUSES.has(status) ? status : 'draft';
}

function normalizeFeatured(value) {
  return ['1', 'true', 'yes', 'y', '是'].includes(text(value, 20).toLowerCase()) ? 1 : 0;
}

function normalizeContentItem(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('內容資料格式不正確。');
  }

  const item = { ...input };
  const normalizedType = normalizeType(item);
  if (!normalizedType) throw new Error('內容類型不正確。');

  const contentId = text(item.content_id, 160);
  const title = text(item.title, 300);
  if (!contentId) throw new Error('缺少內容編號。');
  if (!title) throw new Error('缺少內容標題。');

  item.content_id = contentId;
  item.content_type = text(item.content_type, 100) || CONTENT_TYPE_MAP[normalizedType];
  item.type = normalizedType;
  item.status = normalizeStatus(item.status);
  item.title = title;
  item.publish_date = text(item.publish_date, 40);
  item.sort_order = String(Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : 0);
  item.featured = normalizeFeatured(item.featured) ? 'yes' : 'no';
  item.updated_at = text(item.updated_at, 80) || new Date().toISOString();

  return {
    contentId,
    normalizedType,
    contentType: item.content_type,
    status: item.status,
    title,
    publishDate: item.publish_date,
    sortOrder: Number(item.sort_order) || 0,
    featured: normalizeFeatured(item.featured),
    sourceUrl: text(item.source_url, 2000),
    sourceMessageId: text(item.source_message_id, 300),
    updatedAt: item.updated_at,
    payloadJson: JSON.stringify(item)
  };
}

function normalizePromptCategory(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('分類資料格式錯誤。');
  }
  const categoryId = text(input.id || input.category_id, 80);
  const label = text(input.label, 120);
  if (!categoryId || !label) throw new Error('分類缺少編號或名稱。');
  return {
    categoryId,
    label,
    icon: text(input.icon, 40),
    cssClass: text(input.class || input.css_class, 120),
    sortOrder: Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0,
    status: normalizeStatus(input.status || 'published'),
    updatedAt: text(input.updated_at, 80) || new Date().toISOString()
  };
}

function normalizePrompt(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('提示詞資料格式錯誤。');
  }
  const promptId = Number(input.id ?? input.prompt_id);
  const categoryId = text(input.cat || input.category_id, 80);
  const title = text(input.title, 300);
  const content = text(input.content, 100000);
  if (!Number.isInteger(promptId) || promptId <= 0) throw new Error('提示詞缺少有效編號。');
  if (!categoryId || !title || !content) throw new Error('提示詞缺少分類、標題或內容。');
  const item = {
    ...input,
    id: promptId,
    cat: categoryId,
    title,
    content,
    desc: text(input.desc || input.description, 5000)
  };
  return {
    promptId,
    categoryId,
    title,
    description: item.desc,
    content,
    sortOrder: Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0,
    status: normalizeStatus(input.status || 'published'),
    payloadJson: JSON.stringify(item),
    updatedAt: text(input.updated_at, 80) || new Date().toISOString()
  };
}

function normalizePromptCase(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('案例資料格式錯誤。');
  }
  const caseId = text(input.id || input.case_id, 160);
  const title = text(input.title, 300);
  const promptIds = Array.isArray(input.promptIds)
    ? input.promptIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  if (!caseId || !title || !promptIds.length) throw new Error('案例缺少編號、標題或提示詞關聯。');
  const item = { ...input, id: caseId, promptIds };
  return {
    caseId,
    title,
    promptIdsJson: JSON.stringify(promptIds),
    sortOrder: Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0,
    status: normalizeStatus(input.status || 'published'),
    payloadJson: JSON.stringify(item),
    updatedAt: text(input.updated_at, 80) || new Date().toISOString()
  };
}

function jsonResponse(value, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(JSON.stringify(value), { ...init, headers });
}

function publicHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
  };
}

function errorResponse(message, status = 400) {
  return jsonResponse({ ok: false, error: message }, { status });
}

function isAuthorized(request, env, body) {
  const expected = text(env.INGEST_SECRET, 500);
  if (!expected) return false;
  const authorization = request.headers.get('Authorization') || '';
  const supplied = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : text(body && body.secret, 500);
  return supplied.length === expected.length && supplied === expected;
}

function upsertStatement(db, item) {
  return db.prepare(`
    INSERT INTO contents (
      content_id, normalized_type, content_type, status, title, publish_date,
      sort_order, featured, source_url, source_message_id, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(content_id) DO UPDATE SET
      normalized_type = excluded.normalized_type,
      content_type = excluded.content_type,
      status = excluded.status,
      title = excluded.title,
      publish_date = excluded.publish_date,
      sort_order = excluded.sort_order,
      featured = excluded.featured,
      source_url = excluded.source_url,
      source_message_id = excluded.source_message_id,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).bind(
    item.contentId,
    item.normalizedType,
    item.contentType,
    item.status,
    item.title,
    item.publishDate,
    item.sortOrder,
    item.featured,
    item.sourceUrl,
    item.sourceMessageId,
    item.payloadJson,
    item.updatedAt
  );
}

function upsertPromptCategoryStatement(db, item) {
  return db.prepare(`
    INSERT INTO prompt_categories (
      category_id, label, icon, css_class, sort_order, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(category_id) DO UPDATE SET
      label = excluded.label,
      icon = excluded.icon,
      css_class = excluded.css_class,
      sort_order = excluded.sort_order,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).bind(
    item.categoryId, item.label, item.icon, item.cssClass,
    item.sortOrder, item.status, item.updatedAt
  );
}

function upsertPromptStatement(db, item) {
  return db.prepare(`
    INSERT INTO prompts (
      prompt_id, category_id, title, description, content,
      sort_order, status, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(prompt_id) DO UPDATE SET
      category_id = excluded.category_id,
      title = excluded.title,
      description = excluded.description,
      content = excluded.content,
      sort_order = excluded.sort_order,
      status = excluded.status,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).bind(
    item.promptId, item.categoryId, item.title, item.description, item.content,
    item.sortOrder, item.status, item.payloadJson, item.updatedAt
  );
}

function upsertPromptCaseStatement(db, item) {
  return db.prepare(`
    INSERT INTO prompt_cases (
      case_id, title, prompt_ids_json, sort_order, status, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(case_id) DO UPDATE SET
      title = excluded.title,
      prompt_ids_json = excluded.prompt_ids_json,
      sort_order = excluded.sort_order,
      status = excluded.status,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).bind(
    item.caseId, item.title, item.promptIdsJson, item.sortOrder,
    item.status, item.payloadJson, item.updatedAt
  );
}

async function readBody(request) {
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new Error('請求內容過大。');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Error('請求內容過大。');
  }
  return raw ? JSON.parse(raw) : {};
}

async function getPublishedContent(request, env) {
  const url = new URL(request.url);
  const requestedType = text(url.searchParams.get('type'), 40).toLowerCase();
  if (requestedType && !VALID_TYPES.has(requestedType)) {
    return errorResponse('不支援的內容類型。');
  }

  const sql = requestedType
    ? `SELECT payload_json FROM contents
       WHERE status = 'published' AND normalized_type = ?
       ORDER BY sort_order DESC, publish_date DESC, content_id DESC`
    : `SELECT payload_json FROM contents
       WHERE status = 'published'
       ORDER BY sort_order DESC, publish_date DESC, content_id DESC`;
  const statement = requestedType ? env.DB.prepare(sql).bind(requestedType) : env.DB.prepare(sql);
  const result = await statement.all();
  const items = [];

  for (const row of result.results || []) {
    try {
      items.push(JSON.parse(row.payload_json));
    } catch {
      // A malformed historical row should not make the entire public page fail.
    }
  }

  const payload = {
    ok: true,
    count: items.length,
    updated_at: new Date().toISOString(),
    items
  };
  const callback = text(url.searchParams.get('callback'), 120);
  if (callback) {
    if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
      return errorResponse('callback 格式不正確。');
    }
    return new Response(`${callback}(${JSON.stringify(payload)});`, {
      headers: {
        ...publicHeaders(),
        'Content-Type': 'application/javascript; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }
  return jsonResponse(payload, { headers: publicHeaders() });
}

async function getPromptHub(env) {
  const [categoryResult, promptResult, caseResult] = await Promise.all([
    env.DB.prepare(`
      SELECT category_id, label, icon, css_class, sort_order
      FROM prompt_categories
      WHERE status = 'published'
      ORDER BY sort_order ASC, category_id ASC
    `).all(),
    env.DB.prepare(`
      SELECT payload_json
      FROM prompts
      WHERE status = 'published'
      ORDER BY sort_order ASC, prompt_id ASC
    `).all(),
    env.DB.prepare(`
      SELECT payload_json
      FROM prompt_cases
      WHERE status = 'published'
      ORDER BY sort_order ASC, case_id ASC
    `).all()
  ]);

  const categories = {};
  for (const row of categoryResult.results || []) {
    categories[row.category_id] = {
      label: row.label,
      icon: row.icon,
      class: row.css_class
    };
  }

  const parseRows = (rows) => (rows || []).flatMap((row) => {
    try {
      return [JSON.parse(row.payload_json)];
    } catch {
      return [];
    }
  });
  const prompts = parseRows(promptResult.results);
  const cases = parseRows(caseResult.results);

  return jsonResponse({
    ok: true,
    counts: {
      categories: Object.keys(categories).length,
      prompts: prompts.length,
      cases: cases.length
    },
    updated_at: new Date().toISOString(),
    categories,
    prompts,
    cases
  }, { headers: publicHeaders() });
}

async function syncContents(request, env, body) {
  if (!isAuthorized(request, env, body)) return errorResponse('驗證失敗。', 401);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > MAX_SYNC_ITEMS) {
    return errorResponse(`每批必須包含 1 至 ${MAX_SYNC_ITEMS} 筆內容。`);
  }

  const normalized = items.map(normalizeContentItem);
  const results = await env.DB.batch(normalized.map((item) => upsertStatement(env.DB, item)));
  return jsonResponse({
    ok: true,
    action: 'sync_contents',
    received: normalized.length,
    written: results.filter((result) => result.success).length
  });
}

async function syncPromptHub(request, env, body) {
  if (!isAuthorized(request, env, body)) return errorResponse('驗證失敗。', 401);
  const entity = text(body.entity, 30).toLowerCase();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!PROMPT_HUB_ENTITIES.has(entity)) return errorResponse('不支援的 Prompt Hub 資料類型。');
  if (!items.length || items.length > MAX_SYNC_ITEMS) {
    return errorResponse(`每批需包含 1 到 ${MAX_SYNC_ITEMS} 筆資料。`);
  }

  let normalized;
  let statements;
  if (entity === 'categories') {
    normalized = items.map(normalizePromptCategory);
    statements = normalized.map((item) => upsertPromptCategoryStatement(env.DB, item));
  } else if (entity === 'prompts') {
    normalized = items.map(normalizePrompt);
    statements = normalized.map((item) => upsertPromptStatement(env.DB, item));
  } else {
    normalized = items.map(normalizePromptCase);
    statements = normalized.map((item) => upsertPromptCaseStatement(env.DB, item));
  }

  const results = await env.DB.batch(statements);
  return jsonResponse({
    ok: true,
    action: 'sync_prompt_hub',
    entity,
    received: normalized.length,
    written: results.filter((result) => result.success).length
  });
}

async function ingestToolRead(request, env, body) {
  if (!isAuthorized(request, env, body)) return errorResponse('驗證失敗。', 401);
  const input = body.item && typeof body.item === 'object' ? body.item : {};
  const title = text(input.title, 200);
  const summary = text(input.summary, 2000);
  const sourceUrl = text(input.source_url, 2000);
  if (!title || !summary || !/^https?:\/\//i.test(sourceUrl)) {
    return errorResponse('工具選讀草稿缺少標題、摘要或有效原文網址。');
  }

  const sourceMessageId = text(input.source_message_id, 300);
  const duplicate = sourceMessageId
    ? await env.DB.prepare('SELECT content_id FROM contents WHERE source_message_id = ? LIMIT 1').bind(sourceMessageId).first()
    : await env.DB.prepare('SELECT content_id FROM contents WHERE source_url = ? LIMIT 1').bind(sourceUrl).first();
  if (duplicate) {
    return jsonResponse({ ok: true, result: { created: false, duplicate: true, content_id: duplicate.content_id } });
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const item = {
    ...input,
    content_id: `TOOL-${stamp}-${crypto.randomUUID().slice(0, 8)}`,
    content_type: CONTENT_TYPE_MAP.tools,
    type: 'tools',
    title,
    summary,
    source_url: sourceUrl,
    status: 'draft',
    featured: 'no',
    sort_order: '0',
    publish_date: text(input.publish_date, 40) || now.toISOString().slice(0, 10).replace(/-/g, '/'),
    updated_at: now.toISOString()
  };
  const normalized = normalizeContentItem(item);
  await upsertStatement(env.DB, normalized).run();
  return jsonResponse({ ok: true, result: { created: true, duplicate: false, content_id: normalized.contentId } });
}

async function health(env) {
  const [contentResult, promptResult] = await Promise.all([
    env.DB.prepare(`
      SELECT normalized_type AS type, status, COUNT(*) AS count
      FROM contents
      GROUP BY normalized_type, status
      ORDER BY normalized_type, status
    `).all(),
    env.DB.prepare(`
      SELECT 'categories' AS entity, status, COUNT(*) AS count FROM prompt_categories GROUP BY status
      UNION ALL
      SELECT 'prompts' AS entity, status, COUNT(*) AS count FROM prompts GROUP BY status
      UNION ALL
      SELECT 'cases' AS entity, status, COUNT(*) AS count FROM prompt_cases GROUP BY status
      ORDER BY entity, status
    `).all()
  ]);
  return jsonResponse({
    ok: true,
    service: 'aihub-content-api',
    counts: contentResult.results || [],
    prompt_hub_counts: promptResult.results || []
  }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Max-Age': '86400'
          }
        });
      }
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/api/content')) {
        return await getPublishedContent(request, env);
      }
      if (request.method === 'GET' && url.pathname === '/api/prompt-hub') return await getPromptHub(env);
      if (request.method === 'GET' && url.pathname === '/health') return await health(env);
      if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/api/admin/sync')) {
        const body = await readBody(request);
        if (body.action === 'sync_contents') return await syncContents(request, env, body);
        if (body.action === 'ingest_tool_read') return await ingestToolRead(request, env, body);
        if (body.action === 'sync_prompt_hub') return await syncPromptHub(request, env, body);
        return errorResponse('不支援的動作。');
      }
      return errorResponse('找不到指定的 API。', 404);
    } catch (error) {
      console.error(error);
      return errorResponse('伺服器暫時無法處理請求。', 500);
    }
  }
};

export {
  normalizeContentItem,
  normalizeFeatured,
  normalizePrompt,
  normalizePromptCase,
  normalizePromptCategory,
  normalizeStatus,
  normalizeType
};
