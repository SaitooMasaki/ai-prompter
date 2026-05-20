(function () {
  'use strict';

  // ---- State ----
  let prompts = [];
  let dropdown = null;
  let activeInput = null;
  let filterText = '';
  let selectedIndex = 0;

  // ---- Default prompts ----
  const DEFAULT_PROMPTS = [
    { id: '1', title: 'Summarize',           content: 'Please summarize the following in 3 bullet points:\n\n' },
    { id: '2', title: 'Translate to Japanese', content: 'Translate the following to Japanese:\n\n' },
    { id: '3', title: 'Fix grammar',          content: 'Please fix the grammar and improve the following text:\n\n' },
    { id: '4', title: 'Explain code',         content: 'Explain the following code step by step:\n\n' },
    { id: '5', title: 'Write email',          content: 'Write a professional email about:\n\n' },
  ];

  // ---- Storage ----
  function loadPrompts() {
    chrome.storage.local.get(['prompts'], result => {
      prompts = result.prompts || DEFAULT_PROMPTS;
    });
  }

  chrome.storage.onChanged.addListener(changes => {
    if (changes.prompts) prompts = changes.prompts.newValue || [];
  });

  // ---- AI input detection ----
  function isAIInput(el) {
    return el && (el.contentEditable === 'true' || el.tagName === 'TEXTAREA');
  }

  // ---- カーソル前のテキストを取得 ----
  function getTextBeforeCursor(el) {
    if (el.tagName === 'TEXTAREA') {
      return el.value.slice(0, el.selectionStart);
    }
    const sel = window.getSelection();
    if (!sel.rangeCount) return '';
    const cursor = sel.getRangeAt(0);
    const pre = document.createRange();
    try {
      pre.selectNodeContents(el);
      pre.setEnd(cursor.startContainer, cursor.startOffset);
      return pre.toString();
    } catch {
      return el.textContent || '';
    }
  }

  // ---- フィルタリング ----
  function getFiltered() {
    if (!filterText) return prompts;
    const q = filterText.toLowerCase();
    return prompts.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q)
    );
  }

  // ---- Dropdown ----
  function getDropdown() {
    if (!dropdown || !document.body.contains(dropdown)) {
      dropdown = document.createElement('div');
      dropdown.id = 'ap-dropdown';
      document.body.appendChild(dropdown);
    }
    return dropdown;
  }

  function renderDropdown() {
    const el = getDropdown();
    const filtered = getFiltered();

    if (filtered.length === 0) {
      el.innerHTML = '<div class="ap-empty">No prompts match</div>';
      return;
    }

    el.innerHTML = filtered.map((p, i) => `
      <div class="ap-item${i === selectedIndex ? ' ap-selected' : ''}" data-index="${i}">
        <span class="ap-title">${esc(p.title)}</span>
        <span class="ap-preview">${esc(p.content.slice(0, 55))}${p.content.length > 55 ? '…' : ''}</span>
      </div>
    `).join('');

    el.querySelectorAll('.ap-item').forEach(item => {
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        const p = filtered[parseInt(item.dataset.index)];
        if (p) insertPrompt(p);
      });
      item.addEventListener('mouseenter', () => {
        selectedIndex = parseInt(item.dataset.index);
        renderDropdown();
      });
    });
  }

  function positionDropdown() {
    const el = getDropdown();

    let rect;

    // textarea はSelection APIが使えないので要素自体の座標を使う
    if (activeInput && activeInput.tagName === 'TEXTAREA') {
      rect = activeInput.getBoundingClientRect();
      const dropH = Math.min(getFiltered().length * 56 + 8, 280);
      const spaceAbove = rect.top;
      const showAbove  = spaceAbove > dropH;

      el.style.left   = Math.min(rect.left + window.scrollX, window.innerWidth - 320) + 'px';
      el.style.width  = Math.min(rect.width, 320) + 'px';
      el.style.top    = showAbove ? 'auto' : (rect.bottom + window.scrollY + 4) + 'px';
      el.style.bottom = showAbove ? (window.innerHeight - rect.top + window.scrollY + 4) + 'px' : 'auto';
      return;
    }

    // contenteditable はカーソル座標を使う
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;

    const dropH = Math.min(getFiltered().length * 56 + 8, 280);
    const below = window.innerHeight - rect.bottom > dropH;

    el.style.left   = Math.min(rect.left + window.scrollX, window.innerWidth - 320) + 'px';
    el.style.width  = '300px';
    el.style.top    = below ? (rect.bottom + window.scrollY + 4) + 'px' : 'auto';
    el.style.bottom = below ? 'auto' : (window.innerHeight - rect.top + window.scrollY + 4) + 'px';
  }

  function showDropdown(input, filter) {
    activeInput   = input;
    filterText    = filter;
    selectedIndex = 0;
    const el = getDropdown();
    el.style.display = 'block';
    positionDropdown();
    renderDropdown();
  }

  function hideDropdown() {
    if (dropdown) dropdown.style.display = 'none';
    activeInput   = null;
    filterText    = '';
    selectedIndex = 0;
  }

  // ---- プロンプト挿入 ----
  function insertPrompt(p) {
    if (!activeInput) return;
    activeInput.focus();

    // "/" とその後に入力したフィルター文字を削除してからプロンプトを挿入
    const deleteCount = 1 + filterText.length;
    for (let i = 0; i < deleteCount; i++) {
      document.execCommand('delete', false);
    }
    document.execCommand('insertText', false, p.content);

    hideDropdown();
  }

  // ---- Input イベント: "/" の検出 ----
  function handleInput(e) {
    const target = e.target;
    if (!isAIInput(target)) { hideDropdown(); return; }

    const text    = getTextBeforeCursor(target);
    const slashIdx = text.lastIndexOf('/');

    if (slashIdx === -1) { hideDropdown(); return; }

    // "/" の直前が文字（URLや数式）なら無視
    const before = text[slashIdx - 1];
    if (before && !/[\s\n]/.test(before)) { hideDropdown(); return; }

    const filter = text.slice(slashIdx + 1);

    // フィルター中にスペース・改行が入ったら終了
    if (/[\s\n]/.test(filter)) { hideDropdown(); return; }

    showDropdown(target, filter);
  }

  // ---- キーボードナビゲーション ----
  function handleKeydown(e) {
    if (!dropdown || dropdown.style.display === 'none') return;

    const filtered = getFiltered();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
        renderDropdown();
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        renderDropdown();
        break;
      case 'Enter':
      case 'Tab':
        if (filtered[selectedIndex]) {
          e.preventDefault();
          insertPrompt(filtered[selectedIndex]);
        }
        break;
      case 'Escape':
        hideDropdown();
        break;
    }
  }

  // ---- 外クリックで閉じる ----
  function handleClick(e) {
    if (dropdown && !dropdown.contains(e.target)) hideDropdown();
  }

  // ---- ユーティリティ ----
  function esc(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ---- 初期化 ----
  document.addEventListener('input',   handleInput,   true);
  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('click',   handleClick,   true);

  loadPrompts();
})();
