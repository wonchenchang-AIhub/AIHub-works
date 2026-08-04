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
    .addSeparator()
    .addItem('同步全部內容到 Cloudflare D1', 'syncAllContentToD1')
    .addItem('檢查 Cloudflare D1 連線', 'checkD1Connection')
    .addToUi();
}

function setupContentBackend() {
  const sheet = getResponseSheet_();
  ensureAdminColumns_(sheet);
  backfillContentIds();

  const handlers = ScriptApp.getProjectTriggers().map(function (trigger) {
    return trigger.getHandlerFunction();
  });
  if (handlers.indexOf('handleFormSubmit') === -1) {
    ScriptApp.newTrigger('handleFormSubmit')
      .forSpreadsheet(SpreadsheetApp.openById(AIHUB_SHEET_ID))
      .onFormSubmit()
      .create();
  }
  if (handlers.indexOf('handleContentEdit') === -1) {
    ScriptApp.newTrigger('handleContentEdit')
      .forSpreadsheet(SpreadsheetApp.openById(AIHUB_SHEET_ID))
      .onEdit()
      .create();
  }

  SpreadsheetApp.openById(AIHUB_SHEET_ID)
    .toast('AIHub 內容後台已完成初始化。', 'AIHub 發布管理', 5);
}

function handleFormSubmit(event) {
  const sheet = event.range.getSheet();
  ensureAdminColumns_(sheet);
  initializeRow_(sheet, event.range.getRow());
  trySyncRowsToD1_(sheet, [event.range.getRow()]);
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

function handleContentEdit(event) {
  if (!event || event.range.getRow() < 2) return;
  const sheet = event.range.getSheet();
  if (sheet.getSheetId() !== AIHUB_RESPONSE_GID) return;

  const rows = [];
  const lastRow = event.range.getLastRow();
  for (let row = event.range.getRow(); row <= lastRow; row += 1) {
    initializeRow_(sheet, row);
    rows.push(row);
  }
  trySyncRowsToD1_(sheet, rows);
}

function backfillContentIds() {
  const sheet = getResponseSheet_();
  ensureAdminColumns_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const columns = getHeaderMap_(sheet);
  const rowCount = lastRow - 1;
  const values = sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getDisplayValues();
  const ids = sheet.getRange(2, columns.content_id, rowCount, 1).getValues();
  const statuses = sheet.getRange(2, columns.status, rowCount, 1).getValues();
  const featured = sheet.getRange(2, columns.featured, rowCount, 1).getValues();
  const sortOrders = sheet.getRange(2, columns.sort_order, rowCount, 1).getValues();
  const updatedAt = sheet.getRange(2, columns.updated_at, rowCount, 1).getValues();
  const stamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss');
  const now = new Date();

  values.forEach(function (row, index) {
    const contentType = columns.content_type ? String(row[columns.content_type - 1] || '') : '';
    if (!contentType) return;
    if (!ids[index][0]) {
      const normalizedType = TYPE_MAP[contentType];
      const prefix = normalizedType === 'learning' ? 'LEARN' : normalizedType === 'tools' ? 'TOOL' : 'NOTE';
      ids[index][0] = prefix + '-' + stamp + '-' + (index + 2);
    }
    if (!statuses[index][0]) statuses[index][0] = 'draft';
    if (!featured[index][0]) featured[index][0] = 'no';
    if (sortOrders[index][0] === '' || sortOrders[index][0] === null) sortOrders[index][0] = 0;
    if (!updatedAt[index][0]) updatedAt[index][0] = now;
  });

  sheet.getRange(2, columns.content_id, rowCount, 1).setValues(ids);
  sheet.getRange(2, columns.status, rowCount, 1).setValues(statuses);
  sheet.getRange(2, columns.featured, rowCount, 1).setValues(featured);
  sheet.getRange(2, columns.sort_order, rowCount, 1).setValues(sortOrders);
  sheet.getRange(2, columns.updated_at, rowCount, 1).setValues(updatedAt);
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
  trySyncRowsToD1_(sheet, [row]);

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

function syncAllContentToD1() {
  const sheet = getResponseSheet_();
  ensureAdminColumns_(sheet);
  backfillContentIds();

  const rows = [];
  for (let row = 2; row <= sheet.getLastRow(); row += 1) rows.push(row);
  if (!rows.length) {
    SpreadsheetApp.getUi().alert('目前沒有可同步的內容。');
    return;
  }

  const result = syncRowsToD1_(sheet, rows);
  SpreadsheetApp.getUi().alert(
    'Cloudflare D1 同步完成',
    '已送出 ' + result.sent + ' 筆，D1 寫入 ' + result.written + ' 筆。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function checkD1Connection() {
  const config = getD1Config_();
  const url = config.url.replace(/\/$/, '') + '/health';
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('D1 API 連線失敗，HTTP ' + status + '。');
  }
  const payload = JSON.parse(response.getContentText());
  SpreadsheetApp.getUi().alert(
    'Cloudflare D1 連線正常',
    '服務：' + String(payload.service || 'aihub-content-api'),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function trySyncRowsToD1_(sheet, rows) {
  try {
    const properties = PropertiesService.getScriptProperties();
    if (!properties.getProperty('AIHUB_D1_API_URL')) return;
    syncRowsToD1_(sheet, rows);
  } catch (error) {
    console.error('D1 背景同步失敗：' + String(error && error.message || error));
  }
}

function syncRowsToD1_(sheet, rows) {
  const config = getD1Config_();
  const uniqueRows = rows.filter(function (row, index, values) {
    return row >= 2 && values.indexOf(row) === index;
  });
  const items = uniqueRows.map(function (row) {
    return rowToContentItem_(sheet, row);
  }).filter(function (item) {
    return item && item.content_id && item.title && TYPE_MAP[item.content_type];
  });

  let written = 0;
  const batchSize = 50;
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const response = UrlFetchApp.fetch(config.url, {
      method: 'post',
      contentType: 'application/json; charset=utf-8',
      headers: { Authorization: 'Bearer ' + config.secret },
      payload: JSON.stringify({ action: 'sync_contents', items: batch }),
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    const payload = JSON.parse(response.getContentText() || '{}');
    if (status < 200 || status >= 300 || !payload.ok) {
      throw new Error('D1 同步失敗（HTTP ' + status + '）：' + String(payload.error || '未知錯誤'));
    }
    written += Number(payload.written || 0);
  }
  return { sent: items.length, written: written };
}

function rowToContentItem_(sheet, row) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const item = {};
  headers.forEach(function (header, index) {
    const key = headerKey_(header);
    if (key) item[key] = values[index] || '';
  });
  item.type = TYPE_MAP[item.content_type] || '';
  return item;
}

function getD1Config_() {
  const properties = PropertiesService.getScriptProperties();
  const url = String(properties.getProperty('AIHUB_D1_API_URL') || '').trim();
  const secret = String(properties.getProperty('AIHUB_INGEST_SECRET') || '').trim();
  if (!url) throw new Error('尚未設定 AIHUB_D1_API_URL。');
  if (!/^https:\/\//i.test(url)) throw new Error('AIHUB_D1_API_URL 必須使用 HTTPS。');
  if (!secret) throw new Error('尚未設定 AIHUB_INGEST_SECRET。');
  return { url: url.replace(/\/$/, ''), secret: secret };
}
