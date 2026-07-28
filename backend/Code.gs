const AIHUB_SHEET_ID = '1K9wTv0iQwqfRZLhKyn4ewIrXqobYubKw1GdPqT7GyGc';
const AIHUB_RESPONSE_GID = 1304804522;

const ADMIN_HEADERS = {
  content_id: '內容編號 [content_id]',
  status: '發布狀態 [status]',
  featured: '首頁精選 [featured]',
  sort_order: '排序 [sort_order]',
  updated_at: '更新時間 [updated_at]'
};

const TOOL_INGEST_HEADERS = {
  content_type: '內容類型 [content_type]',
  title: '內容標題 [title]',
  summary: '卡片摘要 [summary]',
  tags: '標籤 [tags]',
  publish_date: '預定發布日 [publish_date]',
  cover_image_url: '封面圖片網址 [cover_image_url]',
  source_url: '原文網址 [source_url]',
  source_platform: '來源平台 [source_platform]',
  source_author: '原作者 [source_author]',
  tool_name: 'AI 工具名稱 [tool_name]',
  curator_note: '我的選讀重點 [curator_note]',
  source_publish_date: '原文發布日 [source_publish_date]',
  source_message_id: '來源郵件識別碼 [source_message_id]',
  source_file: '來源郵件檔案 [source_file]',
  ai_status: 'AI 整理狀態 [ai_status]'
};

const TOOL_INGEST_LIMITS = {
  title: 200,
  summary: 2000,
  tags: 500,
  cover_image_url: 2000,
  source_url: 2000,
  source_platform: 100,
  source_author: 200,
  tool_name: 200,
  curator_note: 2000,
  source_publish_date: 40,
  source_message_id: 200,
  source_file: 500,
  ai_status: 500
};

const TYPE_MAP = {
  'AI 教學簡報': 'learning',
  'AI 工具選讀': 'tools',
  'AI 實作筆記': 'notes'
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('AIHub 發布管理')
    .addItem('初始化後台欄位', 'setupContentBackend')
    .addItem('補齊內容編號', 'backfillContentIds')
    .addToUi();
}

function setupContentBackend() {
  const sheet = getResponseSheet_();
  ensureAdminColumns_(sheet);
  backfillContentIds();

  const exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'handleFormSubmit';
  });
  if (!exists) {
    ScriptApp.newTrigger('handleFormSubmit')
      .forSpreadsheet(SpreadsheetApp.openById(AIHUB_SHEET_ID))
      .onFormSubmit()
      .create();
  }

  SpreadsheetApp.getUi().alert('AIHub 內容後台已完成初始化。');
}

function handleFormSubmit(event) {
  const sheet = event.range.getSheet();
  ensureAdminColumns_(sheet);
  initializeRow_(sheet, event.range.getRow());
}

function onEdit(event) {
  if (!event || event.range.getRow() < 2) return;
  const sheet = event.range.getSheet();
  if (sheet.getSheetId() !== AIHUB_RESPONSE_GID) return;
  const columns = getHeaderMap_(sheet);
  if (columns.updated_at) {
    sheet.getRange(event.range.getRow(), columns.updated_at).setValue(new Date());
  }
}

function backfillContentIds() {
  const sheet = getResponseSheet_();
  ensureAdminColumns_(sheet);
  for (let row = 2; row <= sheet.getLastRow(); row += 1) {
    initializeRow_(sheet, row);
  }
}

function doGet(event) {
  const params = (event && event.parameter) || {};
  const requestedType = String(params.type || '').trim();
  const sheet = getResponseSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.shift() || [];
  const keys = headers.map(headerKey_);

  const items = values.map(function (row) {
    const item = {};
    keys.forEach(function (key, index) {
      if (key) item[key] = row[index] || '';
    });
    item.type = TYPE_MAP[item.content_type] || item.content_type || '';
    return item;
  }).filter(function (item) {
    return String(item.status || '').toLowerCase() === 'published' &&
      (!requestedType || item.type === requestedType);
  }).sort(function (a, b) {
    const orderA = Number(a.sort_order || 0);
    const orderB = Number(b.sort_order || 0);
    if (orderA !== orderB) return orderB - orderA;
    return String(b.publish_date || '').localeCompare(String(a.publish_date || ''));
  });

  const payload = JSON.stringify({
    ok: true,
    count: items.length,
    updated_at: new Date().toISOString(),
    items: items
  });

  const callback = String(params.callback || '');
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + payload + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
  try {
    const body = parsePostBody_(event);
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('AIHUB_INGEST_SECRET');
    if (!expectedSecret) throw new Error('尚未設定 AIHUB_INGEST_SECRET。');
    if (!body.secret || body.secret !== expectedSecret) throw new Error('匯入驗證失敗。');
    if (body.action !== 'ingest_tool_read') throw new Error('不支援的匯入動作。');

    const result = ingestToolRead_(body.item || {});
    return jsonOutput_({ ok: true, result: result });
  } catch (error) {
    return jsonOutput_({ ok: false, error: String(error && error.message || error) });
  }
}

function parsePostBody_(event) {
  const raw = event && event.postData && event.postData.contents;
  if (!raw) throw new Error('缺少 POST 內容。');
  return JSON.parse(raw);
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function ingestToolRead_(input) {
  const sheet = getResponseSheet_();
  ensureColumns_(sheet, TOOL_INGEST_HEADERS);
  ensureAdminColumns_(sheet);

  const item = sanitizeToolRead_(input);
  const columns = getHeaderMap_(sheet);
  const duplicate = findToolReadDuplicate_(sheet, columns, item);
  if (duplicate) {
    return {
      created: false,
      duplicate: true,
      row: duplicate.row,
      content_id: duplicate.content_id || ''
    };
  }

  const row = sheet.getLastRow() + 1;
  const values = {
    content_type: 'AI 工具選讀',
    title: item.title,
    summary: item.summary,
    tags: item.tags,
    publish_date: item.publish_date || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd'),
    cover_image_url: item.cover_image_url,
    source_url: item.source_url,
    source_platform: item.source_platform,
    source_author: item.source_author,
    tool_name: item.tool_name,
    curator_note: item.curator_note,
    source_publish_date: item.source_publish_date,
    source_message_id: item.source_message_id,
    source_file: item.source_file,
    ai_status: item.ai_status,
    status: 'draft',
    featured: 'no',
    sort_order: 0,
    updated_at: new Date()
  };

  Object.keys(values).forEach(function (key) {
    if (columns[key]) sheet.getRange(row, columns[key]).setValue(values[key]);
  });
  initializeRow_(sheet, row);

  return {
    created: true,
    duplicate: false,
    row: row,
    content_id: columns.content_id ? sheet.getRange(row, columns.content_id).getDisplayValue() : ''
  };
}

function sanitizeToolRead_(input) {
  const result = {};
  Object.keys(TOOL_INGEST_LIMITS).forEach(function (key) {
    result[key] = String(input[key] || '').trim().slice(0, TOOL_INGEST_LIMITS[key]);
  });
  result.publish_date = String(input.publish_date || '').trim().slice(0, 40);

  if (!result.title) throw new Error('缺少標題。');
  if (!result.summary) throw new Error('缺少摘要。');
  if (!/^https?:\/\//i.test(result.source_url)) throw new Error('原文網址格式不正確。');
  return result;
}

function findToolReadDuplicate_(sheet, columns, item) {
  if (sheet.getLastRow() < 2) return null;
  const checks = [
    { key: 'source_url', value: item.source_url },
    { key: 'source_message_id', value: item.source_message_id }
  ].filter(function (check) {
    return columns[check.key] && check.value;
  });

  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    const values = sheet.getRange(2, columns[check.key], sheet.getLastRow() - 1, 1).getDisplayValues();
    for (let offset = 0; offset < values.length; offset += 1) {
      if (String(values[offset][0] || '').trim() === check.value) {
        const row = offset + 2;
        return {
          row: row,
          content_id: columns.content_id ? sheet.getRange(row, columns.content_id).getDisplayValue() : ''
        };
      }
    }
  }
  return null;
}

function getResponseSheet_() {
  const spreadsheet = SpreadsheetApp.openById(AIHUB_SHEET_ID);
  const sheet = spreadsheet.getSheets().find(function (candidate) {
    return candidate.getSheetId() === AIHUB_RESPONSE_GID;
  });
  if (!sheet) throw new Error('找不到指定的表單回應工作表。');
  return sheet;
}

function getHeaderMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const map = {};
  headers.forEach(function (header, index) {
    const key = headerKey_(header);
    if (key) map[key] = index + 1;
  });
  return map;
}

function headerKey_(header) {
  const match = String(header || '').match(/\[([a-z0-9_]+)\]/i);
  return match ? match[1].toLowerCase() : '';
}

function ensureAdminColumns_(sheet) {
  ensureColumns_(sheet, ADMIN_HEADERS);
}

function ensureColumns_(sheet, headers) {
  const columns = getHeaderMap_(sheet);
  Object.keys(headers).forEach(function (key) {
    if (!columns[key]) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(headers[key]);
      columns[key] = sheet.getLastColumn();
    }
  });
}

function initializeRow_(sheet, row) {
  const columns = getHeaderMap_(sheet);
  if (!columns.content_type || !sheet.getRange(row, columns.content_type).getValue()) return;

  const idCell = sheet.getRange(row, columns.content_id);
  if (!idCell.getValue()) {
    const type = sheet.getRange(row, columns.content_type).getDisplayValue();
    const prefix = TYPE_MAP[type] === 'learning' ? 'LEARN' : TYPE_MAP[type] === 'tools' ? 'TOOL' : 'NOTE';
    idCell.setValue(prefix + '-' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss') + '-' + row);
  }
  const statusCell = sheet.getRange(row, columns.status);
  if (!statusCell.getValue()) statusCell.setValue('draft');
  const featuredCell = sheet.getRange(row, columns.featured);
  if (!featuredCell.getValue()) featuredCell.setValue('no');
  const orderCell = sheet.getRange(row, columns.sort_order);
  if (!orderCell.getValue()) orderCell.setValue(0);
  sheet.getRange(row, columns.updated_at).setValue(new Date());
}
