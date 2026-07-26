(function () {
  'use strict';

  // ---- State ----
  let prompts = [];
  let dropdown = null;
  let varDialog = null;
  let activeInput = null;
  let filterText = '';
  let selectedIndex = 0;

  const DEFAULT_PROMPTS = [
    { id: '1', title: 'Summarize',            content: 'Please summarize the following in 3 bullet points:\n\n' },
    { id: '2', title: 'Translate to Japanese', content: 'Translate the following to Japanese:\n\n' },
    { id: '3', title: 'Fix grammar',           content: 'Please fix the grammar and improve the following text:\n\n' },
    { id: '4', title: 'Explain code',          content: 'Explain the following code step by step:\n\n' },
    { id: '5', title: 'Write email',           content: 'Write a professional email to {{recipient}} about {{topic}}:\n\n' },
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

  // ---- Variable utils ----
  function parseVariables(content) {
    const matches = [...content.matchAll(/\{\{([^}]+)\}\}/g)];
    return [...new Set(matches.map(m => m[1].trim()))];
  }

  function fillVariables(content, values) {
    let result = content;
    for (const [name, value] of Object.entries(values)) {
      result = result.split(`{{${name}}}`).join(value);
    }
    return result;
  }

  // ---- AI input detection ----
  function isAIInput(el) {
    return el && (el.contentEditable === 'true' || el.tagName === 'TEXTAREA');
  }

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

  // ---- Filter ----
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

    el.innerHTML = filtered.map((p, i) => {
      const vars = parseVariables(p.content);
      const varTag = vars.length ? `<span class="ap-var-tag">{{…}}</span>` : '';
      return `
        <div class="ap-item${i === selectedIndex ? ' ap-selected' : ''}" data-index="${i}">
          <div class="ap-item-top">
            <span class="ap-title">${esc(p.title)}</span>
            ${varTag}
          </div>
          <span class="ap-preview">${esc(p.content.slice(0, 55))}${p.content.length > 55 ? '…' : ''}</span>
        </div>
      `;
    }).join('');

    el.querySelectorAll('.ap-item').forEach(item => {
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        const p = filtered[parseInt(item.dataset.index)];
        if (p) selectPrompt(p);
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

    if (activeInput && activeInput.tagName === 'TEXTAREA') {
      rect = activeInput.getBoundingClientRect();
      const dropH = Math.min(getFiltered().length * 56 + 8, 280);
      const showAbove = rect.top > dropH;
      el.style.left   = Math.min(rect.left + window.scrollX, window.innerWidth - 320) + 'px';
      el.style.width  = Math.min(rect.width, 320) + 'px';
      el.style.top    = showAbove ? 'auto' : (rect.bottom + window.scrollY + 4) + 'px';
      el.style.bottom = showAbove ? (window.innerHeight - rect.top + window.scrollY + 4) + 'px' : 'auto';
      return;
    }

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
    filterText    = '';
    selectedIndex = 0;
  }

  // ---- Prompt selection: 変数あり/なしで分岐 ----
  function selectPrompt(p) {
    const savedFilter = filterText; // hideDropdown前に退避
    const vars = parseVariables(p.content);
    if (vars.length > 0) {
      hideDropdown();
      filterText = savedFilter; // 変数ダイアログ用に復元
      showVariableDialog(p, vars);
    } else {
      insertPrompt(p.content);
    }
  }

  // ---- 変数ダイアログ ----
  function showVariableDialog(p, vars) {
    if (varDialog && document.body.contains(varDialog)) varDialog.remove();

    varDialog = document.createElement('div');
    varDialog.id = 'ap-var-dialog';
    varDialog.innerHTML = `
      <div class="ap-var-header">
        <span class="ap-var-title">${esc(p.title)}</span>
        <button class="ap-var-close" title="Cancel">✕</button>
      </div>
      ${vars.map(v => `
        <div class="ap-var-field">
          <label class="ap-var-label">${esc(v)}</label>
          <input class="ap-var-input" data-var="${esc(v)}" placeholder="${esc(v)}..." />
        </div>
      `).join('')}
      <div class="ap-var-actions">
        <button class="ap-var-cancel-btn">Cancel</button>
        <button class="ap-var-insert-btn">Insert ↵</button>
      </div>
    `;

    // ドロップダウンと同じ位置に表示
    positionElement(varDialog);
    document.body.appendChild(varDialog);

    const firstInput = varDialog.querySelector('.ap-var-input');
    if (firstInput) firstInput.focus();

    const doInsert = () => {
      const values = {};
      varDialog.querySelectorAll('.ap-var-input').forEach(input => {
        values[input.dataset.var] = input.value;
      });
      const filled = fillVariables(p.content, values);
      varDialog.remove();
      varDialog = null;
      insertPrompt(filled);
    };

    const doCancel = () => {
      varDialog.remove();
      varDialog = null;
      if (activeInput) activeInput.focus();
    };

    varDialog.querySelector('.ap-var-close').addEventListener('click', doCancel);
    varDialog.querySelector('.ap-var-cancel-btn').addEventListener('click', doCancel);
    varDialog.querySelector('.ap-var-insert-btn').addEventListener('click', doInsert);

    varDialog.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doInsert(); }
      if (e.key === 'Escape') doCancel();
      e.stopPropagation();
    });
  }

  function positionElement(el) {
    // カーソルかアクティブ入力の近くに配置
    let top = 200, left = 100;

    if (activeInput && activeInput.tagName === 'TEXTAREA') {
      const rect = activeInput.getBoundingClientRect();
      top  = rect.bottom + window.scrollY + 4;
      left = rect.left + window.scrollX;
    } else {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0).cloneRange();
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        if (rect.top) {
          top  = rect.bottom + window.scrollY + 4;
          left = rect.left + window.scrollX;
        }
      }
    }

    el.style.position = 'absolute';
    el.style.top  = Math.min(top, window.innerHeight + window.scrollY - 200) + 'px';
    el.style.left = Math.min(left, window.innerWidth - 320) + 'px';
  }

  // ---- テキスト挿入 ----
  function insertPrompt(content) {
    if (!activeInput) return;
    activeInput.focus();
    const deleteCount = 1 + filterText.length;
    for (let i = 0; i < deleteCount; i++) {
      document.execCommand('delete', false);
    }
    document.execCommand('insertText', false, content);
    activeInput = null;
    filterText  = '';
  }

  // ---- Input イベント ----
  function handleInput(e) {
    const target = e.target;
    if (!isAIInput(target)) { hideDropdown(); return; }

    const text     = getTextBeforeCursor(target);
    const slashIdx = text.lastIndexOf('/');
    if (slashIdx === -1) { hideDropdown(); return; }

    const before = text[slashIdx - 1];
    if (before && !/[\s\n]/.test(before)) { hideDropdown(); return; }

    const filter = text.slice(slashIdx + 1);
    if (/[\s\n]/.test(filter)) { hideDropdown(); return; }

    activeInput = target;
    showDropdown(target, filter);
  }

  // ---- キーボードナビ ----
  function handleKeydown(e) {
    if (varDialog && document.body.contains(varDialog)) return;
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
          selectPrompt(filtered[selectedIndex]);
        }
        break;
      case 'Escape':
        hideDropdown();
        break;
    }
  }

  function handleClick(e) {
    const inDropdown  = dropdown  && dropdown.contains(e.target);
    const inVarDialog = varDialog && varDialog.contains(e.target);
    if (!inDropdown && !inVarDialog) hideDropdown();
  }

  function esc(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  document.addEventListener('input',   handleInput,   true);
  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('click',   handleClick,   true);

  loadPrompts();
})();
