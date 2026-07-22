(function () {
  'use strict';

  const page = document.body.dataset.contentType;
  const list = document.getElementById('contentList');
  const count = document.getElementById('contentCount');
  const status = document.getElementById('contentStatus');
  const apiUrl = String(window.AIHUB_CONTENT_API_URL || '').trim();

  const typeLabels = {
    learning: 'AI 教學簡報',
    tools: 'AI 工具選讀',
    notes: 'AI 實作筆記'
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ''), window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function tagsHtml(value) {
    return String(value || '')
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => `<span class="content-tag">${escapeHtml(tag)}</span>`)
      .join('');
  }

  function coverHtml(item) {
    const cover = safeUrl(item.cover_image_url);
    if (cover) {
      return `<img class="content-cover" src="${escapeHtml(cover)}" alt="" loading="lazy">`;
    }
    const icons = { learning: '📑', tools: '🧰', notes: '✍️' };
    return `<div class="content-cover content-cover-placeholder" aria-hidden="true">${icons[page]}</div>`;
  }

  function metaHtml(item) {
    const parts = [];
    if (item.publish_date) parts.push(`<span>${escapeHtml(item.publish_date)}</span>`);
    if (page === 'learning' && item.audience) parts.push(`<span>適合：${escapeHtml(item.audience)}</span>`);
    if (page === 'tools' && item.source_platform) parts.push(`<span>來源：${escapeHtml(item.source_platform)}</span>`);
    if (page === 'notes' && item.ai_tools) parts.push(`<span>工具：${escapeHtml(item.ai_tools)}</span>`);
    parts.push(tagsHtml(item.tags));
    return parts.join('');
  }

  function actionsHtml(item) {
    if (page === 'learning') {
      const pdf = safeUrl(item.pdf_file);
      return pdf ? `<a class="content-action" href="${escapeHtml(pdf)}" target="_blank" rel="noopener">閱讀 PDF ↗</a>` : '';
    }
    if (page === 'tools') {
      const source = safeUrl(item.source_url);
      return source ? `<a class="content-action" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">閱讀原文 ↗</a>` : '';
    }
    const prompt = safeUrl(item.related_prompt_url);
    return prompt ? `<a class="content-action secondary-action" href="${escapeHtml(prompt)}">相關提示詞 →</a>` : '';
  }

  function extraHtml(item) {
    if (page === 'tools' && item.curator_note) {
      return `<p class="content-extra"><strong>我的選讀重點</strong><br>${escapeHtml(item.curator_note)}</p>`;
    }
    if (page === 'notes' && item.note_body) {
      return `<details class="content-extra"><summary><strong>閱讀完整筆記</strong></summary><p>${escapeHtml(item.note_body)}</p></details>`;
    }
    if (page === 'learning' && item.learning_topics) {
      return `<p class="content-extra"><strong>教學主題：</strong>${escapeHtml(item.learning_topics)}</p>`;
    }
    return '';
  }

  function render(items) {
    count.textContent = `${items.length} 篇已發布內容`;
    status.textContent = '';
    if (!items.length) {
      list.innerHTML = '<div class="content-empty"><strong>目前尚無已發布內容</strong><p>內容完成審核並在後台設為「發布」後，就會顯示在這裡。</p></div>';
      return;
    }

    list.innerHTML = items.map((item) => `
      <article class="content-item">
        ${coverHtml(item)}
        <div class="content-item-body">
          <div class="content-meta">${metaHtml(item)}</div>
          <h2>${escapeHtml(item.title)}</h2>
          <p class="content-summary">${escapeHtml(item.summary)}</p>
          ${extraHtml(item)}
          <div class="content-actions">${actionsHtml(item)}</div>
        </div>
      </article>
    `).join('');
  }

  function showError(message) {
    count.textContent = '';
    status.textContent = message;
    status.classList.add('content-error');
    list.innerHTML = '<div class="content-empty"><strong>內容暫時無法載入</strong><p>請稍後重新整理頁面。</p></div>';
  }

  function loadJsonp() {
    if (!apiUrl) {
      render([]);
      status.textContent = '內容後台連線設定中';
      return;
    }

    const callbackName = `aihubContentCallback_${Date.now()}`;
    const script = document.createElement('script');
    const timer = window.setTimeout(() => finish(new Error('timeout')), 12000);

    function finish(error, payload) {
      window.clearTimeout(timer);
      delete window[callbackName];
      script.remove();
      if (error) {
        showError('後台連線失敗');
        return;
      }
      const items = Array.isArray(payload && payload.items) ? payload.items : [];
      render(items);
    }

    window[callbackName] = (payload) => finish(null, payload);
    script.onerror = () => finish(new Error('load failed'));
    const separator = apiUrl.includes('?') ? '&' : '?';
    script.src = `${apiUrl}${separator}type=${encodeURIComponent(page)}&callback=${encodeURIComponent(callbackName)}`;
    document.head.appendChild(script);
  }

  document.title = `${typeLabels[page]}｜AIHub Works`;
  loadJsonp();
}());
