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
  const result = await env.DB.prepare(`
    SELECT normalized_type AS type, status, COUNT(*) AS count
    FROM contents
    GROUP BY normalized_type, status
    ORDER BY normalized_type, status
  `).all();
  return jsonResponse({ ok: true, service: 'aihub-content-api', counts: result.results || [] }, {
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
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Max-Age': '86400'
          }
        });
      }
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/api/content')) {
        return getPublishedContent(request, env);
      }
      if (request.method === 'GET' && url.pathname === '/health') return health(env);
      if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/api/admin/sync')) {
        const body = await readBody(request);
        if (body.action === 'sync_contents') return syncContents(request, env, body);
        if (body.action === 'ingest_tool_read') return ingestToolRead(request, env, body);
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
  normalizeStatus,
  normalizeType
};
