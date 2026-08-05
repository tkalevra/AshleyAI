'use strict';

/* Ashley front end.
   No framework, no build step, no inline handlers (the CSP forbids them).
   Anything that came from a character sheet or a model reply is put into the
   DOM with textContent, never innerHTML. */

const $ = (id) => document.getElementById(id);

const state = {
  characters: [],
  images: [],
  active: null,
  messages: [],
  chatId: null,
  sending: false,
  user: null
};

/* ── transport ─────────────────────────────────────────────────── */

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options
  });

  if (response.status === 401) {
    window.location.assign('/');
    throw new Error('signed out');
  }
  return response;
}

async function getJSON(path, fallback) {
  try {
    const response = await api(path);
    if (!response.ok) return fallback;
    return await response.json();
  } catch (err) {
    return fallback;
  }
}

async function postJSON(path, body) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/* ── toast ─────────────────────────────────────────────────────── */

let toastTimer = null;

function toast(message, bad = false) {
  const node = $('toast');
  node.textContent = message;
  node.classList.toggle('bad', bad);
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
}

/* ── avatars ───────────────────────────────────────────────────── */

function paintAvatar(node, character) {
  node.textContent = '';
  node.classList.remove('avatar-initial');

  if (character && character.avatar) {
    const img = document.createElement('img');
    img.src = character.avatar;
    img.alt = '';
    node.appendChild(img);
    return;
  }
  if (character && character.emoji) {
    node.textContent = character.emoji;
    return;
  }
  node.classList.add('avatar-initial');
  node.textContent = character && character.name ? character.name.slice(0, 1).toUpperCase() : '?';
}

/* You, in the transcript: an accent disc with your initial, matching the tile
   you signed in from. The colour is a custom property set from JS — not an
   inline style attribute, so the CSP is satisfied. */
function paintYou(node) {
  const name = (state.user && state.user.display_name) || 'You';
  node.textContent = '';
  node.classList.add('avatar-you', 'avatar-initial');
  if (state.user && state.user.accent) {
    node.style.setProperty('--disc-accent', state.user.accent);
  }
  node.textContent = name.slice(0, 1).toUpperCase();
}

/* ── stage directions ──────────────────────────────────────────── */

/* The one piece of rich rendering: *text* becomes a stage direction.
   Split-and-append, so nothing here can inject markup. */
function paintText(container, text) {
  container.textContent = '';
  const parts = String(text).split(/(\*[^*\n]+\*)/g);

  for (const part of parts) {
    if (!part) continue;
    if (/^\*[^*\n]+\*$/.test(part)) {
      const em = document.createElement('em');
      em.className = 'stage';
      em.textContent = part.slice(1, -1);
      container.appendChild(em);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  }
}

/* ── cast list ─────────────────────────────────────────────────── */

function renderCast() {
  const list = $('char-list');
  list.textContent = '';

  if (!state.characters.length) {
    const empty = document.createElement('p');
    empty.className = 'char-empty';
    empty.textContent = 'No characters yet. Write your first one below.';
    list.appendChild(empty);
    return;
  }

  const template = $('tpl-char-item');

  for (const character of state.characters) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = character.id;
    if (state.active && state.active.id === character.id) node.classList.add('active');

    paintAvatar(node.querySelector('[data-avatar]'), character);
    node.querySelector('[data-name]').textContent = character.name || 'Unnamed';
    node.querySelector('[data-sub]').textContent =
      character.tagline || (character.personality || '').slice(0, 48);

    node.addEventListener('click', () => selectCharacter(character.id));
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectCharacter(character.id);
      }
    });
    node.querySelector('[data-edit]').addEventListener('click', (event) => {
      event.stopPropagation();
      openCharacterModal(character.id);
    });
    node.querySelector('[data-del]').addEventListener('click', (event) => {
      event.stopPropagation();
      removeCharacter(character.id);
    });

    list.appendChild(node);
  }
}

/* ── conversation ──────────────────────────────────────────────── */

function selectCharacter(id) {
  const character = state.characters.find((c) => c.id === id);
  if (!character) return;

  state.active = character;
  state.messages = [];
  state.chatId = null;

  renderCast();
  $('topbar-idle').hidden = true;
  $('topbar-char').hidden = false;
  $('topbar-actions').hidden = false;
  paintAvatar($('header-avatar'), character);
  $('header-name').textContent = character.name || 'Unnamed';
  $('header-tagline').textContent = character.tagline || '';

  $('empty-state').hidden = true;
  $('messages').hidden = false;
  $('composer').hidden = false;
  $('messages').textContent = '';
  closeCast();
  $('msg-input').focus();
}

function clearCharacter() {
  state.active = null;
  state.messages = [];
  state.chatId = null;
  $('topbar-idle').hidden = false;
  $('topbar-char').hidden = true;
  $('topbar-actions').hidden = true;
  $('empty-state').hidden = false;
  $('messages').hidden = true;
  $('messages').textContent = '';
  $('composer').hidden = true;
}

function appendMessage(role, text) {
  const node = $('tpl-message').content.firstElementChild.cloneNode(true);
  node.classList.add(role === 'user' ? 'msg-user' : 'msg-assistant');

  const avatar = node.querySelector('[data-avatar]');
  if (role === 'user') paintYou(avatar);
  else paintAvatar(avatar, state.active);
  paintText(node.querySelector('[data-bubble]'), text);

  const box = $('messages');
  box.appendChild(node);
  box.scrollTop = box.scrollHeight;
}

function showTyping() {
  const node = $('tpl-typing').content.firstElementChild.cloneNode(true);
  node.id = 'typing';
  paintAvatar(node.querySelector('[data-avatar]'), state.active);
  const box = $('messages');
  box.appendChild(node);
  box.scrollTop = box.scrollHeight;
}

function hideTyping() {
  const node = $('typing');
  if (node) node.remove();
}

function characterSheet(character) {
  const lines = [`Name: ${character.name}`];
  if (character.tagline) lines.push(`Tagline: ${character.tagline}`);
  lines.push(`Personality: ${character.personality || ''}`);
  if (character.backstory) lines.push(`Backstory: ${character.backstory}`);
  return `CHARACTER:\n${lines.join('\n')}`;
}

async function sendMessage() {
  if (!state.active || state.sending) return;

  const input = $('msg-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';

  appendMessage('user', text);
  state.messages.push({ role: 'user', content: text });

  state.sending = true;
  $('btn-send').disabled = true;
  showTyping();

  try {
    /* The pipeline key stays on the server. This request carries a session
       cookie and nothing else; the backend attaches the key and the guardrail
       is applied inside the pipeline, out of reach of this page. */
    const response = await postJSON('/proxy/chat', {
      messages: [
        { role: 'system', content: characterSheet(state.active) },
        ...state.messages
      ],
      temperature: 0.85,
      max_tokens: 1024
    });

    const data = await response.json().catch(() => ({}));
    hideTyping();

    if (!response.ok) {
      toast(data.error || 'The character could not answer.', true);
      state.messages.pop();
      const last = $('messages').lastElementChild;
      if (last) last.remove();
    } else {
      const reply = (data.choices && data.choices[0] && data.choices[0].message &&
        data.choices[0].message.content) || '…';
      appendMessage('assistant', reply);
      state.messages.push({ role: 'assistant', content: reply });
      await saveChat();
    }
  } catch (err) {
    hideTyping();
    if (err.message !== 'signed out') toast('Cannot reach Ashley right now.', true);
  }

  state.sending = false;
  $('btn-send').disabled = false;
  input.focus();
}

async function saveChat() {
  if (!state.active || !state.messages.length) return;
  if (!state.chatId) state.chatId = `${state.active.id}_${Date.now()}`;

  await postJSON('/api/chats', {
    id: state.chatId,
    characterId: state.active.id,
    messages: state.messages,
    updatedAt: Date.now()
  }).catch(() => {});
}

/* ── history ───────────────────────────────────────────────────── */

async function renderHistory() {
  const list = $('history-list');
  list.textContent = '';

  const chats = await getJSON(`/api/chats/${encodeURIComponent(state.active.id)}`, []);
  if (!chats.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'No saved conversations with this character yet.';
    list.appendChild(empty);
    return;
  }

  chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const template = $('tpl-history-item');

  for (const chat of chats) {
    const node = template.content.firstElementChild.cloneNode(true);
    const when = new Date(chat.updatedAt || 0);
    node.querySelector('[data-date]').textContent = when.toLocaleString('en-CA', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const first = (chat.messages || []).find((m) => m.role === 'user');
    node.querySelector('[data-preview]').textContent = first ? first.content.slice(0, 70) : 'Conversation';
    node.querySelector('[data-count]').textContent = `${(chat.messages || []).length} messages`;
    node.addEventListener('click', () => openHistoryChat(chat.id));
    list.appendChild(node);
  }
}

async function openHistoryChat(chatId) {
  const chat = await getJSON(`/api/chats/load/${encodeURIComponent(chatId)}`, null);
  if (!chat) {
    toast('That conversation could not be opened.', true);
    return;
  }

  state.messages = chat.messages || [];
  state.chatId = chat.id;
  $('messages').textContent = '';
  for (const message of state.messages) appendMessage(message.role, message.content);
  $('history-panel').classList.remove('open');
}

/* ── character modal ───────────────────────────────────────────── */

function openCharacterModal(charId) {
  const existing = charId ? state.characters.find((c) => c.id === charId) : null;
  const root = $('modal-root');
  root.textContent = '';

  const node = $('tpl-char-modal').content.firstElementChild.cloneNode(true);
  const q = (sel) => node.querySelector(sel);
  let avatarUrl = existing ? existing.avatar || null : null;

  q('[data-title]').textContent = existing ? 'Edit character' : 'New character';
  q('[data-name]').value = existing ? existing.name || '' : '';
  q('[data-emoji]').value = existing ? existing.emoji || '' : '';
  q('[data-tagline]').value = existing ? existing.tagline || '' : '';
  q('[data-personality]').value = existing ? existing.personality || '' : '';
  q('[data-backstory]').value = existing ? existing.backstory || '' : '';

  const preview = q('[data-preview]');
  const repaint = () =>
    paintAvatar(preview, {
      avatar: avatarUrl,
      emoji: q('[data-emoji]').value,
      name: q('[data-name]').value
    });
  repaint();

  const error = q('[data-error]');
  const fail = (message) => {
    error.textContent = message;
    error.classList.add('show');
  };

  const picker = q('[data-picker]');

  function renderPicker() {
    picker.textContent = '';
    if (!state.images.length) {
      const empty = document.createElement('p');
      empty.className = 'picker-empty';
      empty.textContent = 'Nothing uploaded yet.';
      picker.appendChild(empty);
      return;
    }
    for (const image of state.images) {
      const button = document.createElement('button');
      button.className = 'thumb' + (avatarUrl === image.url ? ' selected' : '');
      button.type = 'button';
      const img = document.createElement('img');
      img.src = image.url;
      img.alt = '';
      button.appendChild(img);
      button.addEventListener('click', () => {
        avatarUrl = image.url;
        repaint();
        renderPicker();
      });
      picker.appendChild(button);
    }
  }

  q('[data-pick]').addEventListener('click', () => {
    picker.hidden = !picker.hidden;
    if (!picker.hidden) renderPicker();
  });

  q('[data-clear]').addEventListener('click', () => {
    avatarUrl = null;
    repaint();
    renderPicker();
  });

  q('[data-emoji]').addEventListener('input', repaint);

  q('[data-file]').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    error.classList.remove('show');

    const form = new FormData();
    form.append('image', file);
    try {
      const response = await api('/api/images', { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        fail(data.error || 'That image was rejected.');
        return;
      }
      avatarUrl = data.url;
      repaint();
      state.images = await getJSON('/api/images', []);
      renderPicker();
    } catch (err) {
      if (err.message !== 'signed out') fail('Upload failed.');
    }
    event.target.value = '';
  });

  const close = () => root.textContent = '';
  q('[data-close]').addEventListener('click', close);
  q('[data-cancel]').addEventListener('click', close);
  node.addEventListener('mousedown', (event) => {
    if (event.target === node) close();
  });

  q('[data-save]').addEventListener('click', async () => {
    const name = q('[data-name]').value.trim();
    const personality = q('[data-personality]').value.trim();
    if (!name) return fail('Give them a name.');
    if (!personality) return fail('Describe their personality — it drives every reply.');

    const character = {
      id: charId || `char_${Date.now()}`,
      name,
      emoji: q('[data-emoji]').value.trim(),
      tagline: q('[data-tagline]').value.trim(),
      personality,
      backstory: q('[data-backstory]').value.trim(),
      avatar: avatarUrl,
      createdAt: existing ? existing.createdAt || Date.now() : Date.now()
    };

    const response = await postJSON('/api/characters', character);
    if (!response.ok) return fail('Could not save.');

    state.characters = await getJSON('/api/characters', []);
    close();

    if (state.active && state.active.id === character.id) {
      state.active = state.characters.find((c) => c.id === character.id) || null;
      if (state.active) {
        paintAvatar($('header-avatar'), state.active);
        $('header-name').textContent = state.active.name;
        $('header-tagline').textContent = state.active.tagline || '';
      }
    }
    renderCast();
    if (!charId) selectCharacter(character.id);
    toast(charId ? 'Character updated.' : 'Character saved.');
  });

  root.appendChild(node);
  q('[data-name]').focus();
}

async function removeCharacter(id) {
  const character = state.characters.find((c) => c.id === id);
  const label = character ? character.name : 'this character';
  if (!window.confirm(`Delete ${label} and every saved conversation with them?`)) return;

  await api(`/api/characters/${encodeURIComponent(id)}`, { method: 'DELETE' });
  state.characters = await getJSON('/api/characters', []);
  if (state.active && state.active.id === id) clearCharacter();
  renderCast();
  toast(`${label} deleted.`);
}

/* ── theme switcher ────────────────────────────────────────────── */

/* The switcher is a real <select> with a real <label>: keyboard- and
   screen-reader-friendly for free, and it fits the rail. */
function renderThemeSelect() {
  const select = $('theme-select');
  if (!select || !window.AshleyTheme) return;

  select.textContent = '';
  for (const theme of window.AshleyTheme.THEMES) {
    const option = document.createElement('option');
    option.value = theme.id;
    option.textContent = theme.name;
    select.appendChild(option);
  }
  select.value = window.AshleyTheme.current();

  select.addEventListener('change', async () => {
    const chosen = window.AshleyTheme.choose(select.value);
    select.value = chosen;
    /* Persisted to this device immediately; the server copy is best-effort so
       a hiccup never undoes the click you just made. */
    try {
      await postJSON('/api/theme', { theme: chosen });
    } catch (err) {
      /* ignore — localStorage already holds it */
    }
  });
}

/* ── drawers ───────────────────────────────────────────────────── */

function openCast() {
  $('cast').classList.add('open');
  $('scrim').hidden = false;
}

function closeCast() {
  $('cast').classList.remove('open');
  $('scrim').hidden = true;
}

/* ── wiring ────────────────────────────────────────────────────── */

function wire() {
  $('btn-open-cast').addEventListener('click', openCast);
  $('btn-close-cast').addEventListener('click', closeCast);
  $('scrim').addEventListener('click', closeCast);

  $('btn-new-char').addEventListener('click', () => {
    closeCast();
    openCharacterModal(null);
  });
  $('btn-empty-new').addEventListener('click', () => openCharacterModal(null));

  $('btn-new-chat').addEventListener('click', () => {
    if (!state.active) return;
    state.messages = [];
    state.chatId = null;
    $('messages').textContent = '';
    $('msg-input').focus();
  });

  $('btn-history').addEventListener('click', async () => {
    const panel = $('history-panel');
    if (!panel.classList.contains('open') && state.active) await renderHistory();
    panel.classList.toggle('open');
  });
  $('btn-close-history').addEventListener('click', () => {
    $('history-panel').classList.remove('open');
  });

  $('btn-logout').addEventListener('click', async () => {
    await postJSON('/api/logout', {}).catch(() => {});
    window.location.assign('/');
  });

  $('btn-send').addEventListener('click', sendMessage);

  const input = $('msg-input');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 148)}px`;
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if ($('modal-root').firstElementChild) $('modal-root').textContent = '';
    else if ($('history-panel').classList.contains('open')) {
      $('history-panel').classList.remove('open');
    } else closeCast();
  });
}

async function init() {
  wire();

  const session = await getJSON('/api/session', null);
  if (!session) {
    window.location.assign('/');
    return;
  }
  state.user = session.user || null;

  const name = (state.user && state.user.display_name) || 'You';
  $('account-name').textContent = name;
  const disc = $('account-disc');
  disc.textContent = name.slice(0, 1).toUpperCase();
  if (state.user && state.user.accent) {
    disc.style.setProperty('--disc-accent', state.user.accent);
  }

  /* The signed-in user's saved theme wins on load: localStorage is per-device
     and this family shares a tablet. */
  if (window.AshleyTheme) {
    window.AshleyTheme.adopt((state.user && state.user.theme) || session.default_theme);
  }
  renderThemeSelect();

  const [characters, images] = await Promise.all([
    getJSON('/api/characters', []),
    getJSON('/api/images', [])
  ]);
  state.characters = characters;
  state.images = images;
  renderCast();
}

init();
