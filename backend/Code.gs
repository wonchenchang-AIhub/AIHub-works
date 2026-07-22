const AIHUB_SHEET_ID = '1K9wTv0iQwqfRZLhKyn4ewIrXqobYubKw1GdPqT7GyGc';
const AIHUB_RESPONSE_GID = 1304804522;

const ADMIN_HEADERS = {
  content_id: '內容編號 [content_id]',
  status: '發布狀態 [status]',
  featured: '首頁精選 [featured]',
  sort_order: '排序 [sort_order]',
  updated_at: '更新時間 [updated_at]'
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
  const columns = getHeaderMap_(sheet);
  Object.keys(ADMIN_HEADERS).forEach(function (key) {
    if (!columns[key]) sheet.getRange(1, sheet.getLastColumn() + 1).setValue(ADMIN_HEADERS[key]);
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
