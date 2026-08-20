/**
 * AIHub Works 每日使用報表
 *
 * 綁定試算表：Prompt Hub 複製紀錄回覆
 * 回覆欄位：時間戳記、source_site、prompt_id、prompt_title、category、copied_at
 *
 * 事件編碼：
 * - 提示詞複製：沿用既有資料格式。
 * - 內容點閱：prompt_id 使用 CONTENT_VIEW:{type}:{content_id}；source_site
 *   使用 AIHub-works:{type}:content-view。
 */

const COPY_REPORT_CONFIG = Object.freeze({
  recipient: 'wonchen.chang@gmail.com',
  spreadsheetId: '1x93u53DSteG4pmG6_YQfkyIKRtlYdhbHdU1E0Litgrc',
  responseSheetNames: ['Form_Responses', '表單回覆 1'],
  timezone: 'Asia/Taipei',
  reportHour: 7,
  topLimit: 5,
});

const COPY_REPORT_HEADERS = Object.freeze({
  responseTime: ['時間戳記', 'timestamp'],
  sourceSite: ['source_site', '來源網站', '網站來源'],
  promptId: ['prompt_id', '提示詞編號'],
  promptTitle: ['prompt_title', '提示詞名稱', '提示詞標題'],
  category: ['category', '分類'],
  copiedAt: ['copied_at', '複製時間'],
});

/** 每日 07:00 由時間觸發器執行。 */
function sendPromptHubDailyReport() {
  const report = buildPromptHubDailyReport_();

  MailApp.sendEmail({
      to: COPY_REPORT_CONFIG.recipient,
      subject: report.subject,
      body: report.textBody,
      htmlBody: report.htmlBody,
      name: 'Prompt Hub 每日使用報告'
  });
}

/**
 * 相容舊觸發器常用的函式名稱。
 * 若既有觸發器原本執行 sendDailyReport，可保留不必重建。
 */
function sendDailyReport() {
  sendPromptHubDailyReport();
}

/** 首次設定或需要重建時間觸發器時手動執行一次。 */
function installPromptHubDailyReportTrigger() {
  const handler = 'sendPromptHubDailyReport';
  const oldHandlers = new Set([handler, 'sendDailyReport']);

  ScriptApp.getProjectTriggers()
    .filter((trigger) => oldHandlers.has(trigger.getHandlerFunction()))
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger(handler)
    .timeBased()
    .atHour(COPY_REPORT_CONFIG.reportHour)
    .everyDays(1)
    .inTimezone(COPY_REPORT_CONFIG.timezone)
    .create();
}

/** 相容舊程式的觸發器安裝函式名稱。 */
function setupDailyTrigger() {
  installPromptHubDailyReportTrigger();
}

/** 停用每日寄信時手動執行。 */
function removeDailyTrigger() {
  const handlers = new Set(['sendPromptHubDailyReport', 'sendDailyReport']);
  let removed = 0;

  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (handlers.has(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });
  console.log(`已移除 ${removed} 個 Prompt Hub 日報觸發器。`);
}

/** 手動執行，可在寄信前從執行記錄檢查統計結果。 */
function previewPromptHubDailyReport() {
  const report = buildPromptHubDailyReport_();
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(report.textBody);
}

function buildPromptHubDailyReport_() {
  const spreadsheet = getReportSpreadsheet_();
  const sheet = COPY_REPORT_CONFIG.responseSheetNames
    .map((name) => spreadsheet.getSheetByName(name))
    .find(Boolean) || spreadsheet.getSheets()[0];
  if (!sheet) {
    throw new Error(`找不到工作表：${COPY_REPORT_CONFIG.responseSheetNames.join(' / ')}`);
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 1) {
    throw new Error('回覆工作表沒有標題列。');
  }

  const headers = values[0].map(normalizeHeader_);
  const columns = resolveColumns_(headers);
  const period = getReportPeriod_(new Date());
  const records = values.slice(1)
    .map((row) => toCopyRecord_(row, columns))
    .filter((record) => record.promptTitle || record.promptId);
  const periodRecords = records.filter(
    (record) => record.copiedAt >= period.start && record.copiedAt < period.end
  );
  const copyRecords = records.filter((record) => record.eventType === 'prompt_copy');
  const periodCopyRecords = periodRecords.filter((record) => record.eventType === 'prompt_copy');
  const viewRecords = records.filter((record) => record.eventType === 'content_view');
  const periodViewRecords = periodRecords.filter((record) => record.eventType === 'content_view');

  const periodBySource = countBy_(periodCopyRecords, (record) => record.sourceSite);
  const totalBySource = countBy_(copyRecords, (record) => record.sourceSite);
  const periodByCategory = countBy_(periodCopyRecords, (record) => record.category);
  const periodTopPrompts = topItems_(periodCopyRecords, COPY_REPORT_CONFIG.topLimit);
  const periodViewsByType = countBy_(periodViewRecords, (record) => record.category);
  const totalViewsByType = countBy_(viewRecords, (record) => record.category);
  const periodTopContent = topItems_(periodViewRecords, COPY_REPORT_CONFIG.topLimit, true);

  const dateText = formatDate_(period.end, 'yyyy/MM/dd HH:mm');
  const periodText = `${formatDate_(period.start, 'yyyy/MM/dd HH:mm')} ～ ${formatDate_(period.end, 'yyyy/MM/dd HH:mm')}`;
  const subject = `📊 AIHub Works 日報 ${dateText} 複製 +${periodCopyRecords.length}／點閱 +${periodViewRecords.length}`;

  const summary = {
    period: periodText,
    totalCopies: copyRecords.length,
    periodCopies: periodCopyRecords.length,
    sources: mergeSourceCounts_(periodBySource, totalBySource),
    categories: sortCountEntries_(periodByCategory),
    topPrompts: periodTopPrompts,
    totalViews: viewRecords.length,
    periodViews: periodViewRecords.length,
    contentTypes: mergeContentViewCounts_(periodViewsByType, totalViewsByType, periodViewRecords.length),
    topContent: periodTopContent,
  };

  return {
    subject,
    summary,
    textBody: buildTextBody_(summary),
    htmlBody: buildHtmlBody_(summary),
  };
}

function getReportSpreadsheet_() {
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSpreadsheet) return activeSpreadsheet;

  if (!COPY_REPORT_CONFIG.spreadsheetId) {
    throw new Error('這是獨立 Apps Script 專案，請在 COPY_REPORT_CONFIG.spreadsheetId 設定 Prompt Hub 回覆試算表 ID。');
  }
  return SpreadsheetApp.openById(COPY_REPORT_CONFIG.spreadsheetId);
}

function resolveColumns_(headers) {
  const columns = {};
  Object.keys(COPY_REPORT_HEADERS).forEach((key) => {
    columns[key] = findHeaderIndex_(headers, COPY_REPORT_HEADERS[key]);
  });

  ['sourceSite', 'promptId', 'promptTitle', 'category'].forEach((key) => {
    if (columns[key] < 0) {
      throw new Error(`缺少必要欄位：${COPY_REPORT_HEADERS[key].join(' / ')}`);
    }
  });

  if (columns.copiedAt < 0 && columns.responseTime < 0) {
    throw new Error('缺少時間欄位：copied_at / 時間戳記。');
  }
  return columns;
}

function findHeaderIndex_(headers, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader_);
  return headers.findIndex((header) => normalizedAliases.includes(header));
}

function normalizeHeader_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\[[^\]]+\]\s*$/u, '')
    .replace(/[\s_-]+/g, '');
}

function toCopyRecord_(row, columns) {
  const copiedAtValue = columns.copiedAt >= 0 ? row[columns.copiedAt] : '';
  const responseTimeValue = columns.responseTime >= 0 ? row[columns.responseTime] : '';
  const copiedAt = parseDate_(copiedAtValue) || parseDate_(responseTimeValue) || new Date(0);

  return {
    copiedAt,
    sourceSite: normalizeSourceSite_(row[columns.sourceSite]),
    promptId: String(row[columns.promptId] || '').trim(),
    promptTitle: String(row[columns.promptTitle] || '').trim() || '未命名提示詞',
    category: String(row[columns.category] || '').trim() || '未分類',
    eventType: /^CONTENT_VIEW:/i.test(String(row[columns.promptId] || '').trim())
      ? 'content_view'
      : 'prompt_copy',
  };
}

function normalizeSourceSite_(value) {
  const source = String(value || '').trim();
  if (!source) return '未標示來源（舊資料）';

  const normalized = source.toLowerCase().replace(/[\s_/-]+/g, '');
  if (normalized === 'aihubworks') return 'AIHub-works';
  if (normalized === 'prompthub') return '舊版 Prompt_hub';
  return source;
}

function parseDate_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (!value) return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getReportPeriod_(now) {
  const end = new Date(now);
  end.setHours(COPY_REPORT_CONFIG.reportHour, 0, 0, 0);
  if (now < end) end.setDate(end.getDate() - 1);

  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  return { start, end };
}

function countBy_(records, keySelector) {
  return records.reduce((counts, record) => {
    const key = keySelector(record);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function sortCountEntries_(counts) {
  return Object.keys(counts)
    .map((name) => ({ name, count: counts[name] }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hant'));
}

function mergeSourceCounts_(periodCounts, totalCounts) {
  const sources = new Set([...Object.keys(periodCounts), ...Object.keys(totalCounts)]);
  return Array.from(sources)
    .map((name) => ({
      name,
      periodCount: periodCounts[name] || 0,
      totalCount: totalCounts[name] || 0,
    }))
    .sort((a, b) => b.periodCount - a.periodCount || b.totalCount - a.totalCount);
}

function mergeContentViewCounts_(periodCounts, totalCounts, periodTotal) {
  const contentTypes = ['AI 教學簡報', 'AI 工具選讀', 'AI 實作筆記'];
  return contentTypes.map((name) => {
    const periodCount = periodCounts[name] || 0;
    return {
      name,
      periodCount,
      totalCount: totalCounts[name] || 0,
      periodShare: periodTotal ? periodCount / periodTotal : 0,
    };
  });
}

function topItems_(records, limit, includeCategory) {
  const grouped = records.reduce((result, record) => {
    const key = record.promptId || record.promptTitle;
    if (!result[key]) {
      result[key] = {
        title: record.promptTitle,
        category: includeCategory ? record.category : '',
        count: 0,
      };
    }
    result[key].count += 1;
    return result;
  }, {});

  return Object.keys(grouped)
    .map((key) => grouped[key])
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'zh-Hant'))
    .slice(0, limit);
}

function buildTextBody_(summary) {
  const sources = summary.sources.length
    ? summary.sources.map((item) => `• ${item.name}　本期 +${item.periodCount}／累計 ${item.totalCount}`).join('\n')
    : '• 本期沒有複製紀錄';
  const categories = summary.categories.length
    ? summary.categories.map((item) => `• ${item.name}　+${item.count}`).join('\n')
    : '• 本期沒有複製紀錄';
  const topPrompts = summary.topPrompts.length
    ? summary.topPrompts.map((item, index) => `${index + 1}. ${item.title}（${item.count} 次）`).join('\n')
    : '本期沒有複製紀錄';
  const contentTypes = summary.contentTypes
    .map((item) => `• ${item.name}　本期 +${item.periodCount}／累計 ${item.totalCount}／本期點閱占比 ${formatPercent_(item.periodShare)}`)
    .join('\n');
  const topContent = summary.topContent.length
    ? summary.topContent.map((item, index) => `${index + 1}. [${item.category}] ${item.title}（${item.count} 次）`).join('\n')
    : '本期沒有內容點閱紀錄';

  return [
    '📊 AIHub Works 每日使用報告',
    `統計區間：${summary.period}`,
    '────────────────────────',
    `累計複製總數：${summary.totalCopies}　　本期新增：+${summary.periodCopies}`,
    '────────────────────────',
    '【各網站來源統計】',
    sources,
    '────────────────────────',
    '【各分類本期新增次數】',
    categories,
    '────────────────────────',
    '【本期最常被複製的提示詞 TOP 5】',
    topPrompts,
    '────────────────────────',
    `三個內容區累計點閱：${summary.totalViews}　　本期新增：+${summary.periodViews}`,
    '【三個內容區點閱統計】',
    contentTypes,
    '※ 點閱占比＝各區本期點閱次數 ÷ 三區本期點閱總數，不是以訪客或曝光數計算的 CTR。',
    '────────────────────────',
    '【本期最常被點閱的內容 TOP 5】',
    topContent,
  ].join('\n');
}

function buildHtmlBody_(summary) {
  const sourceRows = summary.sources.length
    ? summary.sources.map((item) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml_(item.name)}</td>
          <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e5e7eb">+${item.periodCount}</td>
          <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e5e7eb">${item.totalCount}</td>
        </tr>`).join('')
    : '<tr><td colspan="3" style="padding:10px 12px">本期沒有複製紀錄</td></tr>';

  const categoryItems = summary.categories.length
    ? summary.categories.map((item) => `<li>${escapeHtml_(item.name)}　+${item.count}</li>`).join('')
    : '<li>本期沒有複製紀錄</li>';
  const topItems = summary.topPrompts.length
    ? summary.topPrompts.map((item) => `<li>${escapeHtml_(item.title)}（${item.count} 次）</li>`).join('')
    : '<li>本期沒有複製紀錄</li>';
  const contentRows = summary.contentTypes.map((item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml_(item.name)}</td>
        <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e5e7eb">+${item.periodCount}</td>
        <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e5e7eb">${item.totalCount}</td>
        <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e5e7eb">${formatPercent_(item.periodShare)}</td>
      </tr>`).join('');
  const topContentItems = summary.topContent.length
    ? summary.topContent.map((item) => `<li><strong>${escapeHtml_(item.category)}</strong>｜${escapeHtml_(item.title)}（${item.count} 次）</li>`).join('')
    : '<li>本期沒有內容點閱紀錄</li>';

  return `
    <div style="font-family:Arial,'Noto Sans TC',sans-serif;color:#1f2937;line-height:1.7;max-width:680px">
      <h2 style="margin:0 0 4px">📊 AIHub Works 每日使用報告</h2>
      <div style="color:#4b5563">統計區間：${escapeHtml_(summary.period)}</div>
      <p style="font-size:17px"><strong>累計複製總數：${summary.totalCopies}</strong>　　本期新增：<strong>+${summary.periodCopies}</strong></p>

      <h3>各網站來源統計</h3>
      <table style="border-collapse:collapse;width:100%;border:1px solid #d1d5db">
        <thead style="background:#eef2ff">
          <tr>
            <th style="padding:8px 12px;text-align:left">網站來源</th>
            <th style="padding:8px 12px;text-align:right">本期新增</th>
            <th style="padding:8px 12px;text-align:right">累計</th>
          </tr>
        </thead>
        <tbody>${sourceRows}</tbody>
      </table>

      <h3>各分類本期新增次數</h3>
      <ul>${categoryItems}</ul>

      <h3>本期最常被複製的提示詞 TOP 5</h3>
      <ol>${topItems}</ol>

      <h3>三個內容區點閱統計</h3>
      <p style="font-size:17px"><strong>累計點閱：${summary.totalViews}</strong>　　本期新增：<strong>+${summary.periodViews}</strong></p>
      <table style="border-collapse:collapse;width:100%;border:1px solid #d1d5db">
        <thead style="background:#fdf2f8">
          <tr>
            <th style="padding:8px 12px;text-align:left">內容區</th>
            <th style="padding:8px 12px;text-align:right">本期新增</th>
            <th style="padding:8px 12px;text-align:right">累計</th>
            <th style="padding:8px 12px;text-align:right">本期點閱占比</th>
          </tr>
        </thead>
        <tbody>${contentRows}</tbody>
      </table>
      <p style="font-size:13px;color:#6b7280">點閱占比＝各區本期點閱次數 ÷ 三區本期點閱總數，不是以訪客或曝光數計算的 CTR。</p>

      <h3>本期最常被點閱的內容 TOP 5</h3>
      <ol>${topContentItems}</ol>
    </div>`;
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPercent_(ratio) {
  return `${(Number(ratio || 0) * 100).toFixed(1)}%`;
}

function formatDate_(date, pattern) {
  return Utilities.formatDate(date, COPY_REPORT_CONFIG.timezone, pattern);
}
