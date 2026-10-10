/**
 * Reylo AI — application controller.
 * Chat state, rendering, streaming, storage (all local), engine switching.
 */
import { ReyloCore } from './core.js';
import { ReyloNeural, MODELS } from './neural.js';

/* ---------------- helpers ---------------- */
const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'reylo:v1:chats';
const SETTINGS_KEY = 'reylo:v1:settings';

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Tiny, safe markdown renderer (escape-first). */
function renderMarkdown(src) {
  const codeBlocks = [];
  let text = String(src).replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
    codeBlocks.push({ lang: lang || '', code });
    return `\u0000CODE${codeBlocks.length - 1}\u0000`;
  });

  text = escapeHtml(text)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/^\s*\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, (m) => `<ul>${m}</ul>`)
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr />')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Paragraphs for remaining plain lines
  text = text
    .split(/\n{2,}/)
    .map((block) => {
      if (/^\s*<(h\d|ul|ol|li|blockquote|hr|pre|p|div)/.test(block)) return block;
      if (/^\s*\u0000CODE\d+\u0000$/.test(block)) return block; // raw code block placeholder
      return block.trim() ? `<p>${block.replace(/\n/g, '<br />')}</p>` : '';
    })
    .join('\n');

  text = text.replace(/\u0000CODE(\d+)\u0000/g, (m, i) => {
    const { lang, code } = codeBlocks[Number(i)];
    return `<pre><button class="copy-btn" type="button">Copy</button><code data-lang="${escapeHtml(lang)}">${code.replace(/\n$/, '')}</code></pre>`;
  });

  return text;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function downloadFile(name, content, type = 'text/markdown') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------------- state ---------------- */
const core = new ReyloCore();
const neural = new ReyloNeural({ onStatus: handleNeuralStatus });
const welcomeEl = $('welcome'); // keep a live ref — innerHTML clears would destroy it otherwise

const state = {
  chats: loadJSON(STORAGE_KEY, []),
  activeId: null,
  settings: {
    engine: 'core',
    model: MODELS[0].id,
    temperature: 0.7,
    ...loadJSON(SETTINGS_KEY, {}),
  },
  generating: false,
};

if (state.chats.length === 0) {
  state.chats = [newChat()];
}
state.activeId = state.chats[0].id;

function newChat() {
  return { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: 'New chat', messages: [], createdAt: Date.now() };
}
function activeChat() {
  return state.chats.find((c) => c.id === state.activeId) ?? state.chats[0];
}
function persist() {
  saveJSON(STORAGE_KEY, state.chats);
  saveJSON(SETTINGS_KEY, state.settings);
}

/* ---------------- neural status ---------------- */
function setPill(text, mode = 'ok') {
  $('pillText').textContent = text;
  const dot = $('pillDot');
  dot.className = 'pill-dot' + (mode === 'busy' ? ' busy' : mode === 'error' ? ' error' : '');
}

function handleNeuralStatus(status) {
  const wrap = $('progressWrap');
  if (status.phase === 'downloading' || status.phase === 'importing' || status.phase === 'retrying') {
    wrap.hidden = false;
    $('progressBar').style.width = `${status.progress ?? 8}%`;
    $('progressLabel').textContent = status.message;
    setPill('Neural · loading…', 'busy');
    $('neuralToggleText').textContent = 'Loading…';
  } else if (status.phase === 'downloaded') {
    wrap.hidden = false;
    $('progressBar').style.width = '100%';
    $('progressLabel').textContent = status.message;
  } else if (status.phase === 'ready') {
    wrap.hidden = true;
    $('progressBar').style.width = '0%';
    setPill(`Neural · ${status.model} · ready`, 'ok');
    $('neuralToggleText').textContent = 'Neural is on';
    $('composerHint').textContent = `Neural engine (${status.model}) — streamed on-device`;
    persist();
  } else if (status.phase === 'error') {
    wrap.hidden = true;
    setPill('Neural · failed — using Core', 'error');
    $('neuralToggleText').textContent = 'Enable Neural AI';
    $('composerHint').textContent = 'Core engine — instant answers';
    state.settings.engine = 'core';
    syncEngineUI();
    persist();
  }
}

/* ---------------- rendering ---------------- */
function renderChatList() {
  const list = $('chatList');
  list.innerHTML = '';
  for (const chat of state.chats) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-item' + (chat.id === state.activeId ? ' active' : '');
    btn.innerHTML = `<span class="chat-title">${escapeHtml(chat.title)}</span>
      <span class="chat-del" role="button" aria-label="Delete chat">
        <svg viewBox="0 0 24 24" class="icon" width="14" height="14"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </span>`;
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.chat-del')) {
        e.stopPropagation();
        deleteChat(chat.id);
        return;
      }
      state.activeId = chat.id;
      renderAll();
      $('sidebar').classList.remove('open');
    });
    list.appendChild(btn);
  }
}

function deleteChat(id) {
  state.chats = state.chats.filter((c) => c.id !== id);
  if (state.chats.length === 0) state.chats = [newChat()];
  if (state.activeId === id) state.activeId = state.chats[0].id;
  persist();
  renderAll();
}

function messageRow(role, content, { streaming = false, engine = null } = {}) {
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  const isUser = role === 'user';
  const engineBadge = engine === 'neural' ? '🧠 Neural' : engine === 'core' ? '⚡ Core' : '';
  row.innerHTML = `
    <div class="msg-avatar">${isUser ? 'You' : '<img src="images/logo.png" alt="Reylo" />'}</div>
    <div class="msg-body">
      <div class="msg-meta">
        <span class="who">${isUser ? 'You' : 'Reylo AI'}</span>
        ${engineBadge ? `<span>${engineBadge}</span>` : ''}
      </div>
      <div class="msg-content"></div>
      ${isUser ? '' : `<div class="msg-actions">
        <button class="mini-btn copy-msg" type="button">Copy</button>
      </div>`}
    </div>`;

  const contentEl = row.querySelector('.msg-content');
  if (isUser) {
    contentEl.innerHTML = renderMarkdown(content);
  } else {
    contentEl.innerHTML = streaming
      ? '<div class="typing"><span></span><span></span><span></span></div>'
      : renderMarkdown(content);
  }

  const copyMsg = row.querySelector('.copy-msg');
  if (copyMsg) {
    copyMsg.addEventListener('click', () => {
      navigator.clipboard?.writeText(content).then(() => {
        copyMsg.textContent = 'Copied ✓';
        setTimeout(() => (copyMsg.textContent = 'Copy'), 1500);
      });
    });
  }
  return row;
}

function renderMessages() {
  const container = $('messages');
  container.innerHTML = '';
  const chat = activeChat();

  if (chat.messages.length === 0) {
    container.appendChild(welcomeEl);
    welcomeEl.hidden = false;
    return;
  }
  welcomeEl.hidden = true;

  for (const msg of chat.messages) {
    container.appendChild(messageRow(msg.role, msg.content, { engine: msg.engine }));
  }
}

function renderAll() {
  renderChatList();
  renderMessages();
}

function scrollBottom() {
  const c = $('messages');
  c.scrollTop = c.scrollHeight;
}

/* ---------------- send flow ---------------- */
async function sendMessage(text) {
  const chat = activeChat();
  const trimmed = (text ?? $('input').value).trim();
  if (!trimmed || state.generating) return;

  $('input').value = '';
  autoGrow();

  chat.messages.push({ role: 'user', content: trimmed, ts: Date.now() });
  if (chat.title === 'New chat') {
    chat.title = trimmed.slice(0, 42) + (trimmed.length > 42 ? '…' : '');
  }
  persist();
  renderAll();
  scrollBottom();

  state.generating = true;
  $('sendBtn').disabled = true;
  $('stopBtn').hidden = false;

  const container = $('messages');
  const row = messageRow('assistant', '', { streaming: true });
  container.appendChild(row);
  scrollBottom();
  const contentEl = row.querySelector('.msg-content');

  try {
    let reply;
    if (state.settings.engine === 'neural' && neural.ready) {
      setPill('Neural · thinking…', 'busy');
      const history = chat.messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
      reply = await neural.generate(
        [...history, { role: 'user', content: trimmed }],
        {
          temperature: state.settings.temperature,
          maxNewTokens: 320,
          onToken: (token, full) => {
            contentEl.innerHTML = renderMarkdown(full + ' ▌');
            scrollBottom();
          },
        }
      );
      contentEl.innerHTML = renderMarkdown(reply);
      chat.messages.push({ role: 'assistant', content: reply, engine: 'neural', ts: Date.now() });
      setPill(`Neural · ${MODELS.find((m) => m.id === state.settings.model)?.label ?? 'ready'}`, 'ok');
    } else {
      setPill('Core · thinking…', 'busy');
      const history = chat.messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
      // Small delay so the typing indicator is perceptible for instant answers.
      const [res] = await Promise.all([
        core.chat(trimmed, history),
        new Promise((r) => setTimeout(r, 220)),
      ]);
      reply = res.text;
      contentEl.innerHTML = renderMarkdown(reply);
      chat.messages.push({ role: 'assistant', content: reply, engine: 'core', ts: Date.now() });
      setPill('Reylo Core · instant', 'ok');
    }
  } catch (err) {
    const fallbackMsg =
      `⚠️ **Neural engine hiccup** — ${escapeHtml(err?.message ?? 'unknown error')}.\n\n` +
      'Falling back to **Reylo Core** (instant toolkit engine).';
    contentEl.innerHTML = renderMarkdown(fallbackMsg);
    chat.messages.push({ role: 'assistant', content: fallbackMsg, engine: 'core', ts: Date.now() });
    state.settings.engine = 'core';
    syncEngineUI();
    setPill('Reylo Core · instant', 'ok');
    persist();
  } finally {
    state.generating = false;
    $('sendBtn').disabled = false;
    $('stopBtn').hidden = true;
    renderChatList();
    scrollBottom();
    // Replace streaming placeholder with final row (keeps copy buttons fresh)
    renderMessages();
  }
}

/* ---------------- engine control ---------------- */
async function enableNeural() {
  if (neural.ready && neural.modelId === state.settings.model) {
    state.settings.engine = 'neural';
    syncEngineUI();
    persist();
    return;
  }
  state.settings.engine = 'neural';
  syncEngineUI();
  try {
    await neural.load(state.settings.model);
  } catch {
    /* handled by onStatus */
  }
}

function syncEngineUI() {
  const isNeural = state.settings.engine === 'neural';
  document.querySelectorAll('#engineSeg .seg-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.engine === state.settings.engine);
  });
  if (isNeural && neural.ready) {
    const label = MODELS.find((m) => m.id === state.settings.model)?.label ?? 'model';
    setPill(`Neural · ${label} · ready`, 'ok');
    $('composerHint').textContent = `Neural engine (${label}) — streamed on-device`;
    $('neuralToggleText').textContent = 'Neural is on';
  } else if (!isNeural) {
    setPill('Reylo Core · instant', 'ok');
    $('composerHint').textContent = 'Core engine — instant answers';
    $('neuralToggleText').textContent = 'Enable Neural AI';
  }
  $('modelGroup').style.opacity = isNeural ? 1 : 0.55;
}

/* ---------------- composer ---------------- */
function autoGrow() {
  const el = $('input');
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

/* ---------------- export ---------------- */
function exportChat() {
  const chat = activeChat();
  const lines = [`# ${chat.title}`, '', `*Exported from Reylo AI — ${new Date().toLocaleString()}*`, ''];
  for (const m of chat.messages) {
    lines.push(`**${m.role === 'user' ? 'You' : 'Reylo AI'}** (${m.engine ?? 'core'}):`, '', m.content, '', '---', '');
  }
  downloadFile(`reylo-${chat.title.slice(0, 24).replace(/\W+/g, '-').toLowerCase()}.md`, lines.join('\n'));
}

/* ---------------- events ---------------- */
function bindEvents() {
  $('sendBtn').addEventListener('click', () => sendMessage());
  $('input').addEventListener('input', autoGrow);
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  $('stopBtn').addEventListener('click', () => neural.stop());

  $('newChatBtn').addEventListener('click', () => {
    const chat = newChat();
    state.chats.unshift(chat);
    state.activeId = chat.id;
    persist();
    renderAll();
    $('input').focus();
    $('sidebar').classList.remove('open');
  });

  $('menuBtn').addEventListener('click', () => $('sidebar').classList.toggle('open'));

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => sendMessage(chip.textContent));
  });

  $('welcomeNeuralBtn').addEventListener('click', enableNeural);
  $('neuralToggle').addEventListener('click', () => {
    if (state.settings.engine === 'neural') {
      state.settings.engine = 'core';
      syncEngineUI();
      persist();
    } else {
      enableNeural();
    }
  });

  // Settings modal
  const backdrop = $('modalBackdrop');
  $('settingsBtn').addEventListener('click', () => { backdrop.hidden = false; });
  $('closeSettings').addEventListener('click', () => { backdrop.hidden = true; });
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') backdrop.hidden = true;
    // Ctrl/Cmd+K → new chat
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('newChatBtn').click();
    }
  });

  document.querySelectorAll('#engineSeg .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const engine = btn.dataset.engine;
      if (engine === 'neural') {
        enableNeural();
      } else {
        state.settings.engine = 'core';
        syncEngineUI();
        persist();
      }
    });
  });

  $('modelSelect').addEventListener('change', async (e) => {
    state.settings.model = e.target.value;
    persist();
    if (state.settings.engine === 'neural') {
      neural.pipe = null; // force reload of new model
      await enableNeural();
    }
  });

  $('tempRange').addEventListener('input', (e) => {
    state.settings.temperature = parseFloat(e.target.value);
    $('tempValue').textContent = state.settings.temperature.toFixed(1);
    persist();
  });

  $('exportBtn').addEventListener('click', exportChat);
  $('exportBtn2').addEventListener('click', exportChat);

  $('clearAllBtn').addEventListener('click', () => {
    if (confirm('Delete all chats from this browser? This cannot be undone.')) {
      state.chats = [newChat()];
      state.activeId = state.chats[0].id;
      persist();
      renderAll();
      backdrop.hidden = true;
    }
  });

  // Copy buttons inside code blocks (delegated)
  $('messages').addEventListener('click', (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const code = btn.parentElement.querySelector('code')?.textContent ?? '';
    navigator.clipboard?.writeText(code).then(() => {
      btn.textContent = 'Copied ✓';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    });
  });
}

/* ---------------- init ---------------- */
function init() {
  bindEvents();
  renderAll();
  syncEngineUI();

  // Restore settings UI
  $('modelSelect').value = state.settings.model;
  $('tempRange').value = state.settings.temperature;
  $('tempValue').textContent = Number(state.settings.temperature).toFixed(1);

  // If user left Neural on from a previous visit, warm it up automatically.
  if (state.settings.engine === 'neural') {
    enableNeural();
  }
}

init();
