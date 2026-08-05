'use strict';

/* The picker. Everyone's face, pick one, and only then get asked for
   anything. No inline handlers anywhere: the CSP has no 'unsafe-inline'. */

const $ = (id) => document.getElementById(id);

const state = {
  users: [],
  selected: null
};

/* ── transport ─────────────────────────────────────────────────── */

async function postJSON(path, body) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body)
  });
}

/* ── notices ───────────────────────────────────────────────────── */

function setNotice(node, message) {
  node.textContent = message || '';
  node.classList.toggle('show', Boolean(message));
}

/* ── tiles ─────────────────────────────────────────────────────── */

function initialOf(name) {
  const trimmed = String(name || '').trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?';
}

function tileNodes() {
  return Array.from($('tiles').querySelectorAll('.tile'));
}

function renderTiles() {
  const list = $('tiles');
  list.textContent = '';

  if (!state.users.length) {
    $('tiles-status').textContent =
      'Nobody has been set up yet. Open the parents’ settings to add someone.';
    $('tiles-status').hidden = false;
    return;
  }
  $('tiles-status').hidden = true;

  const template = $('tpl-tile');

  state.users.forEach((user, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = user.id;
    node.tabIndex = index === 0 ? 0 : -1;

    const disc = node.querySelector('[data-disc]');
    /* A custom property, set from JS. Not an inline style attribute in the
       HTML, so the CSP is happy. */
    if (user.accent) disc.style.setProperty('--disc-accent', user.accent);

    node.querySelector('[data-initial]').textContent = initialOf(user.display_name);
    node.querySelector('[data-name]').textContent = user.display_name || 'Someone';

    const lock = node.querySelector('[data-lock]');
    lock.hidden = !user.password_protected;

    node.setAttribute(
      'aria-label',
      user.password_protected
        ? `${user.display_name} — password needed`
        : `Sign in as ${user.display_name}`
    );

    node.addEventListener('click', () => pick(user.id));
    list.appendChild(node);
  });
}

/* Roving tabindex: one stop in the tab order, arrows move within. */
function focusTile(index) {
  const tiles = tileNodes();
  if (!tiles.length) return;
  const clamped = Math.max(0, Math.min(tiles.length - 1, index));
  tiles.forEach((tile, i) => {
    tile.tabIndex = i === clamped ? 0 : -1;
  });
  tiles[clamped].focus();
}

/* The tiles wrap, so "up" and "down" need the real row width. Derive it from
   layout rather than guessing at a column count. */
function perRow(tiles) {
  if (tiles.length < 2) return 1;
  const top = tiles[0].offsetTop;
  let count = 0;
  for (const tile of tiles) {
    if (tile.offsetTop !== top) break;
    count += 1;
  }
  return Math.max(1, count);
}

function wireTileKeys() {
  $('tiles').addEventListener('keydown', (event) => {
    const tiles = tileNodes();
    const index = tiles.indexOf(document.activeElement);
    if (index === -1) return;

    const step = perRow(tiles);
    let next = null;

    if (event.key === 'ArrowRight') next = index + 1;
    else if (event.key === 'ArrowLeft') next = index - 1;
    else if (event.key === 'ArrowDown') next = index + step;
    else if (event.key === 'ArrowUp') next = index - step;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tiles.length - 1;
    else return;

    event.preventDefault();
    focusTile(next);
  });
}

/* ── picking a user ────────────────────────────────────────────── */

function pick(userId) {
  const user = state.users.find((u) => u.id === userId);
  if (!user) return;

  setNotice($('notice'), '');

  if (!user.password_protected) {
    signIn(user, '');
    return;
  }

  state.selected = user;
  $('unlock-initial').textContent = initialOf(user.display_name);
  if (user.accent) $('unlock-disc').style.setProperty('--disc-accent', user.accent);
  $('unlock-name').textContent = user.display_name || 'Someone';
  setNotice($('unlock-notice'), '');
  $('unlock-password').value = '';

  $('picker').hidden = true;
  $('unlock').hidden = false;
  $('unlock-password').focus();
}

function backToPicker() {
  state.selected = null;
  $('unlock').hidden = true;
  $('picker').hidden = false;
  $('unlock-password').value = '';
  setNotice($('unlock-notice'), '');

  const tiles = tileNodes();
  if (tiles.length) focusTile(0);
}

async function signIn(user, password) {
  const button = $('unlock-submit');
  const protectedUser = Boolean(user.password_protected);

  if (protectedUser) {
    button.disabled = true;
    button.textContent = 'Signing in…';
  }

  try {
    const response = await postJSON('/api/login/user', {
      user_id: user.id,
      password: password
    });

    if (response.ok) {
      window.location.assign('/app');
      return;
    }

    const data = await response.json().catch(() => ({}));
    const message = data.error || 'That did not work.';
    if (protectedUser) {
      setNotice($('unlock-notice'), message);
      $('unlock-password').value = '';
      $('unlock-password').focus();
    } else {
      setNotice($('notice'), message);
    }
  } catch (err) {
    const message = 'Cannot reach Ashley. Check that the server is running.';
    setNotice(protectedUser ? $('unlock-notice') : $('notice'), message);
  }

  button.disabled = false;
  button.textContent = 'Sign in';
}

/* ── parents' way in ───────────────────────────────────────────── */

function openAdmin() {
  $('admin-pop').hidden = false;
  $('admin-scrim').hidden = false;
  $('btn-admin').setAttribute('aria-expanded', 'true');
  setNotice($('admin-notice'), '');
  $('admin-password').value = '';
  $('admin-password').focus();
}

function closeAdmin() {
  $('admin-pop').hidden = true;
  $('admin-scrim').hidden = true;
  $('btn-admin').setAttribute('aria-expanded', 'false');
  $('admin-password').value = '';
  $('btn-admin').focus();
}

function adminIsOpen() {
  return !$('admin-pop').hidden;
}

async function submitAdmin(event) {
  event.preventDefault();
  setNotice($('admin-notice'), '');

  const password = $('admin-password').value;
  if (!password) {
    setNotice($('admin-notice'), 'Enter the parents’ password.');
    return;
  }

  const button = $('admin-submit');
  button.disabled = true;
  button.textContent = 'Checking…';

  try {
    const response = await postJSON('/api/admin/login', { password });
    if (response.ok) {
      window.location.assign('/admin');
      return;
    }
    const data = await response.json().catch(() => ({}));
    setNotice($('admin-notice'), data.error || 'That password is not right.');
  } catch (err) {
    setNotice($('admin-notice'), 'Cannot reach Ashley. Check that the server is running.');
  }

  $('admin-password').value = '';
  $('admin-password').focus();
  button.disabled = false;
  button.textContent = 'Continue';
}

/* ── first run ─────────────────────────────────────────────────── */

async function showFirstRun() {
  let data = null;
  try {
    const response = await fetch('/api/admin/first-run', { credentials: 'same-origin' });
    if (!response.ok) return;
    data = await response.json();
  } catch (err) {
    return;
  }

  if (!data || !data.first_run || !data.password) return;

  $('firstrun-password').textContent = data.password;
  $('firstrun').hidden = false;
}

function copyPassword() {
  const node = $('firstrun-password');
  const button = $('btn-copy-password');
  const text = node.textContent;

  const done = () => {
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy'; }, 2000);
  };

  /* navigator.clipboard is unavailable on a plain-http LAN address in some
     browsers, so fall back to selecting the text for a manual copy. */
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, selectPassword);
    return;
  }
  selectPassword();
}

function selectPassword() {
  const node = $('firstrun-password');
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  $('btn-copy-password').textContent = 'Selected — copy it';
}

/* ── wiring ────────────────────────────────────────────────────── */

function wire() {
  wireTileKeys();

  $('unlock-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.selected) return;
    const password = $('unlock-password').value;
    if (!password) {
      setNotice($('unlock-notice'), 'Enter the password.');
      return;
    }
    signIn(state.selected, password);
  });

  $('unlock-back').addEventListener('click', backToPicker);

  $('btn-admin').addEventListener('click', () => {
    if (adminIsOpen()) closeAdmin();
    else openAdmin();
  });
  $('admin-scrim').addEventListener('click', closeAdmin);
  $('admin-cancel').addEventListener('click', closeAdmin);
  $('admin-form').addEventListener('submit', submitAdmin);

  $('btn-copy-password').addEventListener('click', copyPassword);
  $('btn-firstrun-dismiss').addEventListener('click', () => {
    $('firstrun').hidden = true;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (adminIsOpen()) closeAdmin();
    else if (!$('unlock').hidden) backToPicker();
  });
}

async function init() {
  wire();

  let payload = null;
  try {
    const response = await fetch('/api/users', { credentials: 'same-origin' });
    if (response.ok) payload = await response.json();
  } catch (err) {
    payload = null;
  }

  if (!payload) {
    $('tiles-status').textContent = 'Cannot reach Ashley. Check that the server is running.';
    $('tiles-status').hidden = false;
  } else {
    /* The login screen's look is the house default unless this device has
       already been given a theme of its own. */
    if (window.AshleyTheme) window.AshleyTheme.suggest(payload.default_theme);

    state.users = Array.isArray(payload.users) ? payload.users.slice() : [];
    state.users.sort((a, b) => (a.order || 0) - (b.order || 0));
    renderTiles();
  }

  await showFirstRun();
}

init();
