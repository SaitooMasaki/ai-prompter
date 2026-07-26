'use strict';

const FREE_LIMIT = 10;

const DEFAULT_PROMPTS = [
  { id: '1', title: 'Summarize',            content: 'Please summarize the following in 3 bullet points:\n\n' },
  { id: '2', title: 'Translate to Japanese', content: 'Translate the following to Japanese:\n\n' },
  { id: '3', title: 'Fix grammar',           content: 'Please fix the grammar and improve the following text:\n\n' },
  { id: '4', title: 'Explain code',          content: 'Explain the following code step by step:\n\n' },
  { id: '5', title: 'Write email',           content: 'Write a professional email to {{recipient}} about {{topic}}:\n\n' },
];

let prompts = [];
let editingId = null;
let proActive = false;

// ---- Pro / License ----
const LS_PRODUCT_ID = 1073861;

async function validateKeyWithAPI(key) {
  try {
    const res = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: key })
    });
    if (!res.ok) return false;
    const data = await res.json();
    // 正しいProductのキーか確認
    return data.valid === true && data.meta?.product_id === LS_PRODUCT_ID;
  } catch {
    return false;
  }
}

function loadProStatus(cb) {
  chrome.storage.local.get(['licenseKey', 'proVerified'], result => {
    // キャッシュ済みの検証結果を使う（オフライン対応）
    proActive = result.proVerified === true && !!result.licenseKey;
    cb(proActive);
  });
}

// ---- Storage ----
function loadPrompts() {
  chrome.storage.local.get(['prompts'], result => {
    prompts = result.prompts || DEFAULT_PROMPTS;
    // 旧版のWrite emailを変数付きに自動更新
    let updated = false;
    prompts = prompts.map(p => {
      if (p.id === '5' && !p.content.includes('{{')) {
        updated = true;
        return { ...p, content: 'Write a professional email to {{recipient}} about {{topic}}:\n\n' };
      }
      return p;
    });
    if (updated) savePrompts();
    loadProStatus(isPro => renderAll(isPro));
  });
}

function savePrompts() {
  chrome.storage.local.set({ prompts });
}

// ---- Variable detection ----
function parseVariables(content) {
  const matches = [...content.matchAll(/\{\{([^}]+)\}\}/g)];
  return [...new Set(matches.map(m => m[1].trim()))];
}

// ---- Render ----
function renderAll(isPro) {
  renderList(isPro);
  updateProUI(isPro);
}

function updateProUI(isPro) {
  document.getElementById('pro-badge').classList.toggle('hidden', !isPro);

  const count = prompts.length;
  const bar = document.getElementById('upgrade-bar');
  const msg = document.getElementById('upgrade-msg');

  if (!isPro) {
    if (count >= FREE_LIMIT) {
      msg.textContent = `Limit reached (${count}/${FREE_LIMIT})`;
      bar.classList.remove('hidden');
    } else if (count >= FREE_LIMIT - 2) {
      msg.textContent = `${FREE_LIMIT - count} free slot${FREE_LIMIT - count === 1 ? '' : 's'} remaining`;
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
  } else {
    bar.classList.add('hidden');
  }
}

function renderList(isPro) {
  const list = document.getElementById('prompt-list');
  if (prompts.length === 0) {
    list.innerHTML = '<p class="empty">No prompts yet.<br>Click + New to add one.</p>';
    return;
  }
  list.innerHTML = prompts.map(p => {
    const vars = parseVariables(p.content);
    const varBadge = vars.length ? `<span class="var-badge">${vars.map(v => `{{${v}}}`).join(' ')}</span>` : '';
    return `
      <div class="prompt-item" data-id="${p.id}">
        <div class="prompt-title-row">
          <span class="prompt-title">${esc(p.title)}</span>
          ${varBadge}
        </div>
        <div class="prompt-preview">${esc(p.content.slice(0, 60))}${p.content.length > 60 ? '…' : ''}</div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', () => openEditor(item.dataset.id));
  });
}

// ---- Views ----
function showView(view) {
  ['list-view', 'edit-view', 'settings-view'].forEach(id => {
    document.getElementById(id).classList.toggle('hidden', id !== view + '-view');
  });
}

// ---- Edit ----
function openEditor(id) {
  editingId = id || null;
  const p = id ? prompts.find(x => x.id === id) : null;

  document.getElementById('title-input').value   = p?.title   || '';
  document.getElementById('content-input').value = p?.content || '';
  document.getElementById('edit-title-label').textContent = id ? 'Edit Prompt' : 'New Prompt';
  document.getElementById('delete-btn').classList.toggle('hidden', !id);
  updateVarPreview(p?.content || '');

  showView('edit');
  document.getElementById('title-input').focus();
}

function updateVarPreview(content) {
  const vars = parseVariables(content);
  const preview = document.getElementById('var-preview');
  if (vars.length) {
    preview.innerHTML = '🔧 Variables: ' + vars.map(v => `<code>{{${esc(v)}}}</code>`).join(', ');
    preview.classList.remove('hidden');
  } else {
    preview.classList.add('hidden');
  }
}

document.getElementById('content-input').addEventListener('input', e => {
  updateVarPreview(e.target.value);
});

// ---- Settings ----
function openSettings() {
  chrome.storage.local.get(['licenseKey', 'proVerified'], result => {
    const isPro = result.proVerified === true && !!result.licenseKey;

    document.getElementById('free-status').classList.toggle('hidden', isPro);
    document.getElementById('pro-status').classList.toggle('hidden', !isPro);
    document.getElementById('license-section').classList.toggle('hidden', isPro);
    document.getElementById('deactivate-section').classList.toggle('hidden', !isPro);
    document.getElementById('license-input').value = '';
    document.getElementById('license-msg').classList.add('hidden');
    showView('settings');
  });
}

document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('settings-back-btn').addEventListener('click', () => {
  loadProStatus(isPro => renderAll(isPro));
  showView('list');
});

document.getElementById('upgrade-btn').addEventListener('click', openSettings);

document.getElementById('activate-btn').addEventListener('click', async () => {
  const key = document.getElementById('license-input').value.trim();
  const msg = document.getElementById('license-msg');
  const btn = document.getElementById('activate-btn');

  if (!key) {
    msg.textContent = '✗ Please enter your license key.';
    msg.className = 'license-msg error';
    msg.classList.remove('hidden');
    return;
  }

  btn.textContent = 'Verifying...';
  btn.disabled = true;
  msg.classList.add('hidden');

  const valid = await validateKeyWithAPI(key);
  btn.textContent = 'Activate';
  btn.disabled = false;

  if (!valid) {
    msg.textContent = '✗ Invalid or expired license key.';
    msg.className = 'license-msg error';
    msg.classList.remove('hidden');
    return;
  }

  chrome.storage.local.set({ licenseKey: key, proVerified: true }, () => {
    proActive = true;
    msg.textContent = '✓ Pro activated! Enjoy unlimited prompts and variables.';
    msg.className = 'license-msg success';
    msg.classList.remove('hidden');
    document.getElementById('license-section').classList.add('hidden');
    document.getElementById('deactivate-section').classList.remove('hidden');
    document.getElementById('free-status').classList.add('hidden');
    document.getElementById('pro-status').classList.remove('hidden');
  });
});

document.getElementById('deactivate-btn').addEventListener('click', () => {
  if (!confirm('Remove Pro license?')) return;
  chrome.storage.local.remove(['licenseKey', 'proVerified'], () => {
    proActive = false;
    openSettings();
  });
});

// ---- Add / Save ----
document.getElementById('add-btn').addEventListener('click', () => {
  if (!proActive && prompts.length >= FREE_LIMIT) {
    openSettings();
    return;
  }
  openEditor(null);
});

document.getElementById('back-btn').addEventListener('click', () => showView('list'));

document.getElementById('save-btn').addEventListener('click', () => {
  const title   = document.getElementById('title-input').value.trim();
  const content = document.getElementById('content-input').value.trim();
  if (!title || !content) {
    document.getElementById(title ? 'content-input' : 'title-input').focus();
    return;
  }
  if (!proActive && !editingId && prompts.length >= FREE_LIMIT) {
    openSettings();
    return;
  }
  if (editingId) {
    const idx = prompts.findIndex(p => p.id === editingId);
    if (idx >= 0) prompts[idx] = { ...prompts[idx], title, content };
  } else {
    prompts.push({ id: generateId(), title, content });
  }
  savePrompts();
  loadProStatus(isPro => renderAll(isPro));
  showView('list');
});

document.getElementById('delete-btn').addEventListener('click', () => {
  if (!editingId || !confirm('Delete this prompt?')) return;
  prompts = prompts.filter(p => p.id !== editingId);
  savePrompts();
  loadProStatus(isPro => renderAll(isPro));
  showView('list');
});

// ---- Utils ----
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

loadPrompts();
