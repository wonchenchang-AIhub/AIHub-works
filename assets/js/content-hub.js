(function () {
  'use strict';

  const page = document.body.dataset.contentType;
  const list = document.getElementById('contentList');
  const count = document.getElementById('contentCount');
  const status = document.getElementById('contentStatus');
  const clearTagFilter = document.getElementById('clearTagFilter');
  const activeTagLabel = document.getElementById('activeTagLabel');
  const apiUrl = String(window.AIHUB_CONTENT_API_URL || '').trim();
  let allItems = [];
  let activeTag = String(new URLSearchParams(window.location.search).get('tag') || '').trim().slice(0, 80);

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
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function itemTags(value) {
    return String(value || '')
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function sameTag(first, second) {
    return first.localeCompare(second, undefined, { sensitivity: 'base' }) === 0;
  }

  function tagsHtml(value) {
    return itemTags(value)
      .map((tag) => {
        const selected = activeTag && sameTag(tag, activeTag);
        return `<button type="button" class="content-tag${selected ? ' is-active' : ''}" data-tag="${escapeHtml(tag)}" aria-pressed="${selected ? 'true' : 'false'}" aria-label="顯示標籤「${escapeHtml(tag)}」的文章">${escapeHtml(tag)}</button>`;
      })
      .join('');
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

  function filteredItems() {
    if (!activeTag) return allItems;
    return allItems.filter((item) => itemTags(item.tags).some((tag) => sameTag(tag, activeTag)));
  }

  function updateFilterSummary(items) {
    if (!activeTag) {
      count.textContent = `${allItems.length} 篇已發布內容`;
      clearTagFilter.hidden = true;
      activeTagLabel.textContent = '';
      return;
    }
    count.textContent = `${items.length} 篇符合篩選（全部 ${allItems.length} 篇）`;
    activeTagLabel.textContent = activeTag;
    clearTagFilter.hidden = false;
  }

  function render() {
    const items = filteredItems();
    updateFilterSummary(items);
    status.textContent = '';
    if (!items.length) {
      list.innerHTML = activeTag
        ? `<div class="content-empty"><strong>找不到標籤「${escapeHtml(activeTag)}」的文章</strong><p>請清除篩選，或選擇其他標籤。</p></div>`
        : '<div class="content-empty"><strong>目前尚無已發布內容</strong><p>內容完成審核並在後台設為「發布」後，就會顯示在這裡。</p></div>';
      return;
    }

    list.innerHTML = items.map((item) => `
      <article class="content-item">
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

  function setTagFilter(tag, historyMode) {
    activeTag = String(tag || '').trim().slice(0, 80);
    const url = new URL(window.location.href);
    if (activeTag) url.searchParams.set('tag', activeTag);
    else url.searchParams.delete('tag');
    if (historyMode === 'push') window.history.pushState({}, '', url);
    render();
    document.querySelector('.content-toolbar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showError(message) {
    count.textContent = '';
    status.textContent = message;
    status.classList.add('content-error');
    list.innerHTML = '<div class="content-empty"><strong>內容暫時無法載入</strong><p>請稍後重新整理頁面。</p></div>';
  }

  function loadJsonp() {
    if (!apiUrl) {
      allItems = [];
      render();
      status.textContent = '內容後台連線設定中';
      return;
    }

    const callbackName = `aihubContentCallback_${Date.now()}`;
    const script = document.createElement('script');
    // Apps Script cold starts can exceed 12 seconds even when the API is healthy.
    const timer = window.setTimeout(() => finish(new Error('timeout')), 30000);

    function finish(error, payload) {
      window.clearTimeout(timer);
      delete window[callbackName];
      script.remove();
      if (error) {
        showError('後台連線失敗');
        return;
      }
      const items = Array.isArray(payload && payload.items) ? payload.items : [];
      allItems = items;
      render();
    }

    window[callbackName] = (payload) => finish(null, payload);
    script.onerror = () => finish(new Error('load failed'));
    const separator = apiUrl.includes('?') ? '&' : '?';
    script.src = `${apiUrl}${separator}type=${encodeURIComponent(page)}&callback=${encodeURIComponent(callbackName)}`;
    document.head.appendChild(script);
  }

  list.addEventListener('click', (event) => {
    const tagButton = event.target.closest('.content-tag');
    if (!tagButton) return;
    const selectedTag = String(tagButton.dataset.tag || '');
    setTagFilter(activeTag && sameTag(selectedTag, activeTag) ? '' : selectedTag, 'push');
  });

  clearTagFilter.addEventListener('click', () => setTagFilter('', 'push'));
  window.addEventListener('popstate', () => {
    activeTag = String(new URLSearchParams(window.location.search).get('tag') || '').trim().slice(0, 80);
    render();
  });

  document.title = `${typeLabels[page]}｜AIHub Works`;
  loadJsonp();
}());
