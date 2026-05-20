'use strict';

const DEFAULT_PROMPTS = [
  { id: '1', title: 'Summarize',            content: 'Please summarize the following in 3 bullet points:\n\n' },
  { id: '2', title: 'Translate to Japanese', content: 'Translate the following to Japanese:\n\n' },
  { id: '3', title: 'Fix grammar',           content: 'Please fix the grammar and improve the following text:\n\n' },
  { id: '4', title: 'Explain code',          content: 'Explain the following code step by step:\n\n' },
  { id: '5', title: 'Write email',           content: 'Write a professional email about:\n\n' },
];

let prompts = [];
let editingId = null;

// ---- Storage ----
function loadPrompts() {
  chrome.storage.local.get(['prompts'], result => {
    prompts = result.prompts || DEFAULT_PROMPTS;
    renderList();
  });
}

function savePrompts() {
  chrome.storage.local.set({ prompts });
}

// ---- List view ----
function renderList() {
  const list = document.getElementById('prompt-list');
  if (prompts.length === 0) {
    list.innerHTML = '<p class="empty">No prompts yet.<br>Click + New to add one.</p>';
    return;
  }
  list.innerHTML = prompts.map(p => `
    <div class="prompt-item" data-id="${p.id}">
      <div class="prompt-title">${esc(p.title)}</div>
      <div class="prompt-preview">${esc(p.content.slice(0, 60))}${p.content.length > 60 ? '…' : ''}</div>
    </div>
  `).join('');

  list.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', () => openEditor(item.dataset.id));
  });
}

// ---- Edit view ----
function openEditor(id) {
  editingId = id || null;
  const p = id ? prompts.find(x => x.id === id) : null;

  document.getElementById('title-input').value   = p?.title   || '';
  document.getElementById('content-input').value = p?.content || '';
  document.getElementById('edit-title-label').textContent = id ? 'Edit Prompt' : 'New Prompt';
  document.getElementById('delete-btn').classList.toggle('hidden', !id);

  showView('edit');
  document.getElementById('title-input').focus();
}

function showView(view) {
  document.getElementById('list-view').classList.toggle('hidden', view !== 'list');
  document.getElementById('edit-view').classList.toggle('hidden', view !== 'edit');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- Event handlers ----
document.getElementById('add-btn').addEventListener('click', () => openEditor(null));
document.getElementById('back-btn').addEventListener('click', () => showView('list'));

document.getElementById('save-btn').addEventListener('click', () => {
  const title   = document.getElementById('title-input').value.trim();
  const content = document.getElementById('content-input').value.trim();
  if (!title || !content) {
    document.getElementById(title ? 'content-input' : 'title-input').focus();
    return;
  }
  if (editingId) {
    const idx = prompts.findIndex(p => p.id === editingId);
    if (idx >= 0) prompts[idx] = { ...prompts[idx], title, content };
  } else {
    prompts.push({ id: generateId(), title, content });
  }
  savePrompts();
  showView('list');
  renderList();
});

document.getElementById('delete-btn').addEventListener('click', () => {
  if (!editingId || !confirm('Delete this prompt?')) return;
  prompts = prompts.filter(p => p.id !== editingId);
  savePrompts();
  showView('list');
  renderList();
});

loadPrompts();
