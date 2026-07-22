/* AIHub Works Prompt Hub v3.5 */

/* ── State ─────────────────────────────────────────────────────────────── */

/* ── Google Form 複製記錄 ─────────────────────────────────────────────── */
var _COPY_LOG_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSd0ceJqdNzp3cHFPvOxkiu4wPy76nHqioj9I-0JP8_CNCjbDg/formResponse';

function logCopyToGoogleForm(prompt) {
  try {
    var data = new FormData();
    data.append('entry.748276167',  String(prompt.id    || ''));
    data.append('entry.324033027',  String(prompt.title  || ''));
    data.append('entry.2019876852', String(prompt.cat    || ''));
    data.append('entry.98204614',   new Date().toISOString());
    data.append('entry.496213319',  'AIHub-works');
    fetch(_COPY_LOG_FORM_URL, { method: 'POST', mode: 'no-cors', body: data });
  } catch (e) {}
}

let currentCat = 'all';
let searchQuery = '';
let currentModalId = null;


/* ── Toast ──────────────────────────────────────────────────────────────── */
let toastTimer = null;

function showToast(message) {
  let toast = document.getElementById('aihubToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'aihubToast';
    toast.className = 'aihub-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

/* ── Favorites & recently viewed ───────────────────────────────────────── */
const FAVORITES_KEY = 'aihub_favorite_prompt_ids';
const RECENT_KEY = 'aihub_recent_prompt_ids';
const RECENT_LIMIT = 20;

function loadIdList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
  } catch (e) {
    return [];
  }
}

function saveIdList(key, ids) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch (e) {}
}

function getFavoriteIds() { return loadIdList(FAVORITES_KEY); }
function isFavorite(id) { return getFavoriteIds().includes(Number(id)); }

function toggleFavorite(e, id) {
  if (e) e.stopPropagation();
  const numericId = Number(id);
  let ids = getFavoriteIds();
  const removing = ids.includes(numericId);

  ids = removing
    ? ids.filter(x => x !== numericId)
    : [numericId, ...ids];

  saveIdList(FAVORITES_KEY, ids);
  updatePersonalCounts();
  renderCards();
  showToast(removing ? '已取消收藏' : '★ 已加入收藏');
}

function rememberRecent(id) {
  const numericId = Number(id);
  const ids = [numericId, ...loadIdList(RECENT_KEY).filter(x => x !== numericId)].slice(0, RECENT_LIMIT);
  saveIdList(RECENT_KEY, ids);
  updatePersonalCounts();
}

function updatePersonalCounts() {
  const fav = document.getElementById('count-favorites');
  const recent = document.getElementById('count-recent');
  if (fav) fav.textContent = getFavoriteIds().length;
  if (recent) recent.textContent = loadIdList(RECENT_KEY).length;
}


/* ── Case prompt cache ───────────────────────────────────────────────────── */
let __modalCaseCache = [];

/* ── Copy-count display (localStorage only) ─────────────────────────────── */
var _LS_KEY     = 'prompt_copy_counts';
var _memCounts  = null;
var _INIT_COUNTS = {"1":18,"3":6,"4":8,"5":7,"6":7,"7":7,"9":9,"10":14,"11":11,"12":14,"13":11,"14":8,"15":8,"16":8,"17":8,"18":9,"19":22,"81":18,"20":9,"21":12,"22":9,"23":12,"24":11,"25":9,"26":12,"27":7,"28":5,"29":7,"30":7,"31":9,"32":8,"33":11,"34":10,"35":10,"36":11,"37":9,"38":8,"39":9,"40":7,"41":7,"43":7,"44":9,"45":7,"46":5,"47":8,"48":9,"49":5,"50":8,"51":5,"52":9,"8":16,"53":11,"54":9,"55":11,"56":8,"57":7,"58":7,"59":8,"60":9,"61":7,"62":10,"63":9,"64":12,"65":11,"66":12,"67":11,"68":6,"69":7,"70":7,"71":6,"72":7,"73":5,"74":22,"75":9,"76":12,"77":9,"78":9,"79":11,"80":11,"82":7,"83":11,"84":7,"85":11,"86":8,"87":9,"88":7,"89":7,"90":12,"91":9,"92":8,"102":9,"103":12,"104":10,"105":9,"106":11,"107":11,"108":11,"109":9};

function _lsLoad() {
  try {
    var stored = localStorage.getItem(_LS_KEY);
    if (!stored || stored === '{}') return Object.assign({}, _INIT_COUNTS);
    var data = JSON.parse(stored);
    var merged = Object.assign({}, _INIT_COUNTS);
    Object.keys(data).forEach(function(k) {
      merged[k] = Math.max(parseInt(merged[k]) || 0, parseInt(data[k]) || 0);
    });
    return merged;
  } catch(e) { return Object.assign({}, _INIT_COUNTS); }
}
function _lsSave(c) {
  try { localStorage.setItem(_LS_KEY, JSON.stringify(c)); } catch(e) {}
}

function getCount(id) {
  return (_memCounts || _lsLoad())[id] || 0;
}

function incrementCount(id) {
  var c = _memCounts || _lsLoad();
  c[id] = (c[id] || 0) + 1;
  _memCounts = c;
  _lsSave(c);
  return c[id];
}

window.addEventListener('DOMContentLoaded', function() {
  _memCounts = _lsLoad();
});

/* ── Helpers ────────────────────────────────────────────────────────────── */
function catInfo(key) {
  return CATEGORIES[key] || { label: key, icon: '◉', class: '' };
}
function getCases(pid) {
  return (typeof CASES_BY_PROMPT !== 'undefined' && CASES_BY_PROMPT[pid])
    ? CASES_BY_PROMPT[pid] : [];
}
function caseTagClass(type) {
  if (type === 'practice') return 'practice';
  return '';
}
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function highlightText(text, query) {
  const safeText = escapeHtml(String(text || ''));
  const q = String(query || '').trim();
  if (!q) return safeText;

  const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safeText.replace(
    new RegExp(`(${escapedQuery})`, 'gi'),
    '<mark class="search-highlight">$1</mark>'
  );
}

function getVisiblePrompts() {
  const q = searchQuery.trim().toLowerCase();
  const favoriteIds = getFavoriteIds();
  const recentIds = loadIdList(RECENT_KEY);

  let items = PROMPTS.filter(p => {
    let matchCat = currentCat === 'all' || p.cat === currentCat;
    if (currentCat === 'favorites') matchCat = favoriteIds.includes(Number(p.id));
    if (currentCat === 'recent') matchCat = recentIds.includes(Number(p.id));
    if (currentCat === 'popular') matchCat = true;

    const categoryLabel = String(catInfo(p.cat).label || '').toLowerCase();
    const matchQ = !q ||
      String(p.title || '').toLowerCase().includes(q) ||
      String(p.content || '').toLowerCase().includes(q) ||
      String(p.scene || '').toLowerCase().includes(q) ||
      String(p.desc || '').toLowerCase().includes(q) ||
      categoryLabel.includes(q);

    return matchCat && matchQ;
  });

  if (currentCat === 'recent') {
    items.sort((a, b) =>
      recentIds.indexOf(Number(a.id)) - recentIds.indexOf(Number(b.id))
    );
  }

  if (currentCat === 'popular') {
    items.sort((a, b) => getCount(b.id) - getCount(a.id));
    items = items.slice(0, 20);
  }

  return items;
}

function updateSearchStatus(count) {
  const status = document.getElementById('searchStatus');
  const clearButton = document.getElementById('searchClearBtn');
  if (!status) return;

  if (searchQuery.trim()) {
    status.innerHTML = `找到 <strong>${count}</strong> 組符合「${escapeHtml(searchQuery.trim())}」的提示詞`;
    status.classList.add('is-visible');
    if (clearButton) clearButton.classList.add('is-visible');
  } else {
    status.textContent = '';
    status.classList.remove('is-visible');
    if (clearButton) clearButton.classList.remove('is-visible');
  }
}


/* ── Copy utilities ─────────────────────────────────────────────────────── */
function doPromptCopy(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied-prompt');
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ 已複製！';
    setTimeout(() => { btn.classList.remove('copied-prompt'); btn.innerHTML = orig; }, 2000);
  }).catch(err => console.error('複製失敗', err));
}

function doCaseCopy(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied-case');
    btn.textContent = '✓ 已複製';
    setTimeout(() => { btn.classList.remove('copied-case'); btn.textContent = '⎘ 複製案例'; }, 2000);
  }).catch(err => console.error('複製失敗', err));
}

/* ── Card rendering ─────────────────────────────────────────────────────── */
function renderCards() {
  const grid = document.getElementById('cardGrid');
  const filtered = getVisiblePrompts();

  updateSearchStatus(filtered.length);

  if (!filtered.length) {
    const message = currentCat === 'favorites'
      ? '尚未收藏提示詞'
      : currentCat === 'recent'
        ? '尚無最近瀏覽紀錄'
        : currentCat === 'popular'
          ? '尚無熱門提示詞資料'
          : `找不到符合「${searchQuery}」的提示詞`;

    grid.innerHTML = `
      <div class="no-results">
        <span>◎</span>
        <p>${message}</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const cat = catInfo(p.cat);
    const cases = getCases(p.id);
    const copies = getCount(p.id);
    const favorite = isFavorite(p.id);

    return `
      <article class="prompt-card">
        <header class="prompt-card__header">
          <span class="prompt-card__category">${cat.icon} ${highlightText(cat.label, searchQuery)}</span>
          <button
            class="favorite-btn ${favorite ? 'is-favorite' : ''}"
            type="button"
            onclick="toggleFavorite(event, ${p.id})"
            aria-label="${favorite ? '取消收藏' : '加入收藏'}"
            title="${favorite ? '取消收藏' : '加入收藏'}">
            ${favorite ? '★' : '☆'}
          </button>
        </header>

        <div class="prompt-card__body" onclick="openModal(${p.id})">
          <h2 class="prompt-card__title">${highlightText(p.title, searchQuery)}</h2>
          ${p.scene ? `<p class="prompt-card__scene">${highlightText(p.scene, searchQuery)}</p>` : ''}
          <p class="prompt-card__summary">${highlightText(p.content, searchQuery)}</p>
        </div>

        <footer class="prompt-card__footer">
          <div class="prompt-card__actions">
            <button
              class="card-preview-btn"
              type="button"
              onclick="openModal(${p.id})">
              👁 查看
            </button>
            <button
              class="card-copy-prompt-btn"
              type="button"
              aria-label="複製提示詞，目前已複製 ${copies} 次"
              onclick="copyPrompt(event, ${p.id})">
              ⎘ 複製提示詞 <span class="card-copy-count" aria-hidden="true">· ${copies}</span>
            </button>
          </div>
        </footer>

        ${cases.length ? `
          <button
            class="case-toggle"
            type="button"
            onclick="toggleCases(event, ${p.id})"
            aria-expanded="false">
            <span class="case-toggle__icon">▶</span>
            <span>📋 實戰案例（${cases.length}）</span>
          </button>
          <div class="cases-list" id="cases-${p.id}"></div>
        ` : ''}
      </article>
    `;
  }).join('');
}


async function sharePrompt(event, id) {
  if (event) event.stopPropagation();
  const prompt = PROMPTS.find(item => Number(item.id) === Number(id));
  if (!prompt) return;

  const url = new URL(window.location.href);
  url.searchParams.set('prompt', String(id));
  const shareData = {
    title: `${prompt.title}｜AIHub Works`,
    text: prompt.title,
    url: url.toString()
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      showToast('已開啟分享選單');
    } else {
      await navigator.clipboard.writeText(shareData.url);
      showToast('✓ 分享連結已複製');
    }
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    try {
      await navigator.clipboard.writeText(shareData.url);
      showToast('✓ 分享連結已複製');
    } catch (copyError) {
      showToast('分享失敗，請稍後再試');
    }
  }
}

function copyPrompt(event, id) {
  if (event) event.stopPropagation();
  const prompt = PROMPTS.find(item => Number(item.id) === Number(id));
  if (!prompt) return;

  const button = event && event.currentTarget ? event.currentTarget : null;
  doPromptCopy(prompt.content, button || document.createElement('button'));
  logCopyToGoogleForm(prompt);

  const newCount = incrementCount(id);
  const counter = button ? button.querySelector('.card-copy-count') : null;
  if (counter) counter.textContent = `· ${newCount}`;
  if (button) button.setAttribute('aria-label', `複製提示詞，目前已複製 ${newCount} 次`);
  showToast('✓ 已複製提示詞');
}

function toggleCases(event, id) {
  if (event) event.stopPropagation();

  const button = event.currentTarget;
  const list = document.getElementById(`cases-${id}`);
  const cases = getCases(id);
  if (!button || !list || !cases.length) return;

  const isOpen = button.getAttribute('aria-expanded') === 'true';

  if (isOpen) {
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = `<span class="case-toggle__icon">▶</span><span>📋 實戰案例（${cases.length}）</span>`;
    list.innerHTML = '';
    return;
  }

  button.setAttribute('aria-expanded', 'true');
  button.innerHTML = `<span class="case-toggle__icon">▼</span><span>📋 實戰案例（${cases.length}）</span>`;

  list.innerHTML = cases.map((item, index) => `
    <div class="case-item">
      <div class="case-item__header">
        <strong>${escapeHtml(item.title || `案例 ${index + 1}`)}</strong>
      </div>
      ${item.scene ? `<p>${escapeHtml(item.scene)}</p>` : ''}
      <button type="button" class="case-copy-btn" data-case-index="${index}">
        ⎘ 複製案例
      </button>
    </div>
  `).join('');

  list.querySelectorAll('.case-copy-btn').forEach((caseButton, index) => {
    caseButton.addEventListener('click', (clickEvent) => {
      clickEvent.stopPropagation();
      const item = cases[index];
      doCaseCopy(item.prompt || item.content || '', caseButton);
      showToast('✓ 已複製實戰案例');
    });
  });
}

function openModal(id) {
  rememberRecent(id);
  currentModalId = Number(id);
  __modalCaseCache = [];
  const p = PROMPTS.find(x => x.id === id);
  if (!p) return;
  const cat = catInfo(p.cat);

  const catTag = document.getElementById('modalCat');
  catTag.textContent = `${cat.icon} ${cat.label}`;
  catTag.className   = `modal-cat-tag ${cat.class}`;
  document.getElementById('modalTitle').textContent = p.title;
  const sceneEl = document.getElementById('modalScene');
  if (p.desc) {
    sceneEl.textContent = '💡 ' + p.desc;
    sceneEl.style.display = 'block';
  } else {
    sceneEl.style.display = 'none';
  }
  document.getElementById('modalContent').textContent = p.content;

  const cnt = getCount(id);
  document.getElementById('modalCopyCount').textContent = cnt > 0 ? `已複製 ${cnt} 次` : '';

  const cases       = getCases(id);
  const casesPanelEl = document.getElementById('modalCases');
  const casesListEl  = document.getElementById('modalCasesList');

  if (cases.length) {
    casesPanelEl.style.display = 'block';
    casesListEl.innerHTML = cases.map(c => {
      const idx = __modalCaseCache.length;
      __modalCaseCache.push(c.prompt);
      const tipsHtml = (c.tips && c.tips.length) ? `
        <div class="modal-case-section">
          <div class="modal-case-section-label">💡 進階練習</div>
          <div class="modal-case-text">${c.tips.map(t => '• ' + escapeHtml(t)).join('\n')}</div>
        </div>` : '';
      return `
        <div class="modal-case-item">
          <div class="modal-case-header">
            <span class="case-tag ${caseTagClass(c.type)}">${c.typeLabel}</span>
            <span class="modal-case-title">${escapeHtml(c.title)}</span>
            <button class="modal-case-copy"
              onclick="modalCopyCase(this,${idx})"
              title="複製此案例的完整提示詞">
              ⎘ 複製案例
            </button>
          </div>
          <div class="modal-case-section">
            <div class="modal-case-section-label">📍 適用場景</div>
            <div class="modal-case-text">${escapeHtml(c.scene)}</div>
          </div>
          <div class="modal-case-section">
            <div class="modal-case-section-label">🔧 使用前準備</div>
            <div class="modal-case-text">${escapeHtml(c.prep || '')}</div>
          </div>
          ${tipsHtml}
          <div class="modal-case-section">
            <div class="modal-case-section-label">📋 完整案例提示詞</div>
            <pre class="modal-case-prompt" data-modal-case-idx="${idx}"></pre>
          </div>
        </div>`;
    }).join('');
    casesListEl.querySelectorAll('.modal-case-prompt[data-modal-case-idx]').forEach(pre => {
      const idx = parseInt(pre.dataset.modalCaseIdx);
      pre.textContent = __modalCaseCache[idx] || '';
    });
  } else {
    casesPanelEl.style.display = 'none';
    casesListEl.innerHTML = '';
  }

  const overlay = document.getElementById('modalOverlay');
  document.getElementById('modalScroll').scrollTop = 0;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.dataset.promptId = id;
  document.body.style.overflow = 'hidden';
  document.getElementById('copyConfirm').classList.remove('show');
  updateModalNavigation();
}

/* Modal：複製提示詞（藍）*/
document.getElementById('copyBtn').addEventListener('click', () => {
  const id = parseInt(document.getElementById('modalOverlay').dataset.promptId);
  const p  = PROMPTS.find(x => x.id === id);
  if (!p) return;
  navigator.clipboard.writeText(p.content).then(() => {
    const newCnt = incrementCount(id);
    logCopyToGoogleForm(p);
    const btn = document.getElementById('copyBtn');
    btn.classList.add('copied-prompt');
    btn.innerHTML = '<span class="copy-icon">✓</span> 已複製！';
    setTimeout(() => { btn.classList.remove('copied-prompt'); btn.innerHTML = '<span class="copy-icon">⎘</span> 複製提示詞'; }, 2200);
    const confirm = document.getElementById('copyConfirm');
    confirm.textContent = `第 ${newCnt} 次複製`;
    confirm.classList.add('show');
    setTimeout(() => confirm.classList.remove('show'), 2400);
    document.getElementById('modalCopyCount').textContent = `已複製 ${newCnt} 次`;
    renderCards();
  }).catch(err => console.error('複製失敗', err));
});

/* Modal：複製案例（綠）*/
function modalCopyCase(btn, idx) {
  const text = __modalCaseCache[idx];
  if (!text) return;
  doCaseCopy(text, btn);
}

/* ── Close modal ────────────────────────────────────────────────────────── */

function updateModalNavigation() {
  const items = getVisiblePrompts();
  const currentIndex = items.findIndex(item => Number(item.id) === Number(currentModalId));
  const prevButton = document.getElementById('modalPrevBtn');
  const nextButton = document.getElementById('modalNextBtn');
  const position = document.getElementById('modalPosition');

  if (position) {
    position.textContent = currentIndex >= 0 ? `${currentIndex + 1} / ${items.length}` : '';
  }

  if (prevButton) {
    prevButton.disabled = currentIndex <= 0;
    prevButton.onclick = () => {
      if (currentIndex > 0) openModal(items[currentIndex - 1].id);
    };
  }

  if (nextButton) {
    nextButton.disabled = currentIndex < 0 || currentIndex >= items.length - 1;
    nextButton.onclick = () => {
      if (currentIndex >= 0 && currentIndex < items.length - 1) {
        openModal(items[currentIndex + 1].id);
      }
    };
  }
}

function navigateModal(direction) {
  const items = getVisiblePrompts();
  const currentIndex = items.findIndex(item => Number(item.id) === Number(currentModalId));
  const nextIndex = currentIndex + direction;
  if (nextIndex >= 0 && nextIndex < items.length) {
    openModal(items[nextIndex].id);
  }
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});

/* ── Category nav ───────────────────────────────────────────────────────── */
document.getElementById('catNav').addEventListener('click', e => {
  const btn = e.target.closest('.cat-btn');
  if (!btn) return;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentCat = btn.dataset.cat;
  renderCards();
});

/* ── 分類列：左右箭頭捲動 + 滑鼠滾輪橫向捲動 + 箭頭自動啟用/禁用 ───────── */
(function setupCatNavScroll() {
  const nav      = document.getElementById('catNav');
  const btnLeft  = document.getElementById('catScrollLeft');
  const btnRight = document.getElementById('catScrollRight');
  if (!nav || !btnLeft || !btnRight) return;

  function updateArrows() {
    const max = nav.scrollWidth - nav.clientWidth;
    btnLeft.disabled  = nav.scrollLeft <= 2;
    btnRight.disabled = nav.scrollLeft >= max - 2;
  }

  function scrollByAmount(dir) {
    nav.scrollBy({ left: dir * Math.max(160, nav.clientWidth * 0.6), behavior: 'smooth' });
  }

  btnLeft.addEventListener('click', () => scrollByAmount(-1));
  btnRight.addEventListener('click', () => scrollByAmount(1));

  // 滑鼠垂直滾輪直接轉成橫向捲動（不需要按 Shift）
  nav.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      nav.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  nav.addEventListener('scroll', updateArrows);
  window.addEventListener('resize', updateArrows);
  updateArrows();
})();

/* ── Search ─────────────────────────────────────────────────────────────── */
document.getElementById('searchInput').addEventListener('input', e => {
  searchQuery = e.target.value;
  renderCards();
});


document.addEventListener('keydown', event => {
  const activeTag = document.activeElement ? document.activeElement.tagName : '';
  const typing = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

  if (event.key === '/' && !typing) {
    event.preventDefault();
    const input = document.getElementById('searchInput');
    if (input) input.focus();
  }

  if (event.key === 'Escape') {
    closeModal();
  }

  const overlay = document.getElementById('modalOverlay');
  const modalOpen = overlay && overlay.classList.contains('open');

  if (modalOpen && event.key === 'ArrowLeft') {
    navigateModal(-1);
  }

  if (modalOpen && event.key === 'ArrowRight') {
    navigateModal(1);
  }
});


const searchClearBtn = document.getElementById('searchClearBtn');
if (searchClearBtn) {
  searchClearBtn.addEventListener('click', () => {
    const input = document.getElementById('searchInput');
    searchQuery = '';
    if (input) {
      input.value = '';
      input.focus();
    }
    renderCards();
  });
}

const modalFooterClose = document.getElementById('modalFooterClose');
if (modalFooterClose) {
  modalFooterClose.addEventListener('click', closeModal);
}

const modalShareBtn = document.getElementById('modalShareBtn');
if (modalShareBtn) {
  modalShareBtn.addEventListener('click', event => {
    if (currentModalId !== null) sharePrompt(event, currentModalId);
  });
}

const backToTop = document.getElementById('backToTop');
if (backToTop) {
  window.addEventListener('scroll', () => {
    backToTop.classList.toggle('is-visible', window.scrollY > 500);
  });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ── Init ───────────────────────────────────────────────────────────────── */
updatePersonalCounts();
document.querySelectorAll('.cat-btn[data-cat]').forEach(button => {
  const category = button.dataset.cat;
  if (!CATEGORIES[category]) return;
  const count = button.querySelector('.cat-count');
  if (count) count.textContent = PROMPTS.filter(prompt => prompt.cat === category).length;
});
const promptTotal = document.getElementById('promptTotal');
const caseTotal = document.getElementById('caseTotal');
const allCount = document.getElementById('count-all');
if (promptTotal) promptTotal.textContent = PROMPTS.length;
if (caseTotal) caseTotal.textContent = typeof CASES !== 'undefined' ? CASES.length : 0;
if (allCount) allCount.textContent = PROMPTS.length;
const popularCount = document.getElementById('count-popular');
if (popularCount) popularCount.textContent = Math.min(20, PROMPTS.length);
renderCards();

const deepLinkedPromptId = Number(new URLSearchParams(window.location.search).get('prompt'));
if (Number.isFinite(deepLinkedPromptId) && PROMPTS.some(p => Number(p.id) === deepLinkedPromptId)) {
  setTimeout(() => openModal(deepLinkedPromptId), 120);
}
