'use strict';

/* Parents' settings.
   No framework, no inline handlers (the CSP has no 'unsafe-inline'), and
   nothing that came from a person or the server is ever put into the DOM
   with innerHTML.

   The page gates itself: every /api/admin/* call needs an admin session, so
   a 401 anywhere drops straight back to the password prompt. */

const $ = (id) => document.getElementById(id);

/* Eight friendly accents. Anything else can still be typed by hand into the
   colour box that sits alongside them. */
const ACCENTS = [
  '#7c5cff', '#f472b6', '#ff8a5b', '#facc15',
  '#4ade80', '#38bdf8', '#a78bfa', '#94a3b8'
];

const REDACTED = '••••';

const state = {
  users: [],
  config: null,
  addAccent: ACCENTS[0],
  defaultTheme: 'dark',

  /* The four shipped templates, as metadata only — label, age band, latitude
     and the paragraph a parent reads to choose. The prompt bodies never come
     down this route; they arrive per person as `effective` text. */
  presets: [],
  presetById: Object.create(null),
  defaultPreset: '',

  /* The person whose rules are open, the last payload the server gave us for
     them, and the text each box held at that moment (so "unsaved" is a real
     comparison and not a guess). */
  rulesUserId: null,
  rules: null,
  baseline: { guardrail_system: '', safety_floor: '' }
};

/* The two editable boxes. Everything about them is the same except which
   field of the payload they carry, so they are described once here. */
const EDITORS = [
  {
    field: 'guardrail_system',
    textarea: 'rules-guardrail',
    stateChip: 'rules-guardrail-state',
    notice: 'rules-guardrail-notice',
    save: 'btn-save-guardrail',
    reset: 'btn-reset-guardrail',
    name: 'How characters should behave'
  },
  {
    field: 'safety_floor',
    textarea: 'rules-floor',
    stateChip: 'rules-floor-state',
    notice: 'rules-floor-notice',
    save: 'btn-save-floor',
    reset: 'btn-reset-floor',
    name: 'Safety rules'
  }
];

/* ── transport ─────────────────────────────────────────────────── */

let signedOut = false;

async function call(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options
  });

  if (response.status === 401) {
    /* On the very first visit this is simply "you are not signed in", which
       needs no scolding message. Mid-session it means the session went away
       — usually because the password was just changed elsewhere. */
    const wasSignedIn = !$('panel').hidden;
    showGate(wasSignedIn ? 'Signed out. Enter the parents’ password again.' : '');
    signedOut = true;
    throw new Error('signed out');
  }

  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }
  return { ok: response.ok, status: response.status, data: data || {} };
}

function send(method, path, body) {
  return call(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

/* Every failure the parent sees is either the server's own sentence or this
   one — never a stack trace, never a status code. */
function problem(result, fallback) {
  return (result && result.data && result.data.error) || fallback;
}

/* ── what the setup checklist and the tour are allowed to know ─────

   onboarding.js and tour.js sit on top of this page. Rather than have them
   reach into its internals (or rely on top-level function declarations
   happening to land on `window`), they get one small, explicit surface and
   two events. Everything they need is a read or a navigation; nothing here
   lets them write. */

function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail: detail || null }));
}

/* ── notices and toast ─────────────────────────────────────────── */

function setNotice(node, message, kind) {
  node.textContent = message || '';
  node.classList.remove('notice-error', 'notice-ok', 'notice-warn');
  node.classList.add(kind === 'ok' ? 'notice-ok' : kind === 'warn' ? 'notice-warn' : 'notice-error');
  node.classList.toggle('show', Boolean(message));
}

let toastTimer = null;

function toast(message, bad) {
  const node = $('toast');
  node.textContent = message;
  node.classList.toggle('bad', Boolean(bad));
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
}

/* ── gate ──────────────────────────────────────────────────────── */

function showGate(message) {
  $('panel').hidden = true;
  $('gate').hidden = false;
  setNotice($('gate-notice'), message || '');
  $('gate-password').value = '';
  $('gate-password').focus();
  emit('ashley:admin-closed');
}

function showPanel() {
  $('gate').hidden = true;
  $('panel').hidden = false;
  emit('ashley:admin-open');
}

async function submitGate(event) {
  event.preventDefault();
  const password = $('gate-password').value;
  if (!password) {
    setNotice($('gate-notice'), 'Enter the password.');
    return;
  }

  const button = $('gate-submit');
  button.disabled = true;
  button.textContent = 'Checking…';

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password })
    });

    if (response.ok) {
      signedOut = false;
      showPanel();
      try {
        await loadEverything();
      } catch (err) {
        /* a 401 during the load has already put the gate back */
      }
    } else {
      const data = await response.json().catch(() => ({}));
      setNotice($('gate-notice'), data.error || 'That password is not right.');
      $('gate-password').value = '';
      $('gate-password').focus();
    }
  } catch (err) {
    setNotice($('gate-notice'), 'Cannot reach Ashley. Check that the server is running.');
  }

  button.disabled = false;
  button.textContent = 'Continue';
}

/* ── tabs ──────────────────────────────────────────────────────── */

const TABS = ['users', 'prompts', 'model', 'appearance', 'password'];

function selectTab(name) {
  for (const tab of TABS) {
    const button = $(`tab-${tab}`);
    const section = $(`sec-${tab}`);
    const on = tab === name;
    button.setAttribute('aria-selected', on ? 'true' : 'false');
    section.hidden = !on;
  }
}

function wireTabs() {
  for (const tab of TABS) {
    $(`tab-${tab}`).addEventListener('click', () => selectTab(tab));
  }

  $('panel').querySelector('.tabs').addEventListener('keydown', (event) => {
    const index = TABS.indexOf(
      (document.activeElement.dataset && document.activeElement.dataset.tab) || ''
    );
    if (index === -1) return;

    let next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;

    event.preventDefault();
    $(`tab-${TABS[next]}`).focus();
    selectTab(TABS[next]);
  });
}

/* ── colour swatches ───────────────────────────────────────────── */

/* Returns a setter so the caller can re-mark the selection after a save. */
function buildSwatches(container, selected, onPick) {
  container.textContent = '';
  const template = $('tpl-swatch');
  const buttons = [];

  for (const colour of ACCENTS) {
    const button = template.content.firstElementChild.cloneNode(true);
    /* A custom property, not an inline style attribute. */
    button.style.setProperty('--swatch', colour);
    button.setAttribute('aria-label', `Colour ${colour}`);
    button.dataset.colour = colour;
    button.addEventListener('click', () => {
      onPick(colour);
      mark(colour);
    });
    buttons.push(button);
    container.appendChild(button);
  }

  /* The eight above cover it, but a parent who wants an exact colour can
     reach for the system picker. */
  const custom = document.createElement('input');
  custom.type = 'color';
  custom.className = 'swatch-custom';
  custom.value = selected || ACCENTS[0];
  custom.setAttribute('aria-label', 'Pick any other colour');
  custom.addEventListener('input', () => {
    onPick(custom.value);
    mark(custom.value);
  });
  container.appendChild(custom);

  function mark(colour) {
    for (const button of buttons) {
      button.setAttribute(
        'aria-checked',
        button.dataset.colour.toLowerCase() === String(colour).toLowerCase() ? 'true' : 'false'
      );
    }
    custom.value = /^#[0-9a-f]{6}$/i.test(colour) ? colour : custom.value;
  }

  mark(selected || ACCENTS[0]);
  return mark;
}

/* ── templates (the four shipped rule sets) ────────────────────── */

async function loadPresets() {
  const result = await call('/api/admin/presets');
  if (!result.ok) {
    /* Not fatal: the rest of the panel still works, the tags just cannot say
       which rules someone is on. */
    setNotice($('rules-notice'), problem(result, 'Could not load the four templates.'));
    return;
  }

  const list = Array.isArray(result.data.presets) ? result.data.presets : [];
  state.presets = list;
  state.presetById = Object.create(null);
  for (const preset of list) {
    if (preset && preset.id) state.presetById[preset.id] = preset;
  }
  state.defaultPreset = result.data.default_preset || (list[0] && list[0].id) || '';

  renderAddPreset();
}

/* "8-12" is how the data reads; "Ages 8–12" is how a parent reads it. */
function ageBandText(preset) {
  const band = String((preset && preset.age_band) || '').trim();
  if (!band) return 'Any age';
  return `Ages ${band.replace(/\s*-\s*/, '–')}`;
}

/* The latitude in one word. The shipped labels already carry a friendly one
   after the middle dot ("Child (8–12) · Gentle"), so prefer that and fall
   back to the raw latitude if a template is ever labelled differently. */
function latitudeText(preset) {
  const label = String((preset && preset.label) || '');
  const parts = label.split('·');
  if (parts.length > 1) {
    const tail = parts[parts.length - 1].trim();
    if (tail) return tail;
  }
  return (preset && preset.latitude) === 'unhinged' ? 'Relaxed' : 'Protective';
}

function isLoose(preset) {
  return Boolean(preset) && preset.latitude === 'unhinged';
}

function addChip(container, text, className, title) {
  const chip = $('tpl-chip').content.firstElementChild.cloneNode(true);
  chip.textContent = text;
  if (className) chip.classList.add(className);
  if (title) chip.title = title;
  container.appendChild(chip);
  return chip;
}

/* Age band and latitude, side by side, everywhere a person or a template is
   named — so nobody has to open anything to see that a 10-year-old and a
   15-year-old are not on the same settings. */
function renderChips(container, presetId) {
  container.textContent = '';

  const preset = state.presetById[presetId];
  if (!preset) {
    addChip(
      container,
      presetId ? 'Template not found' : 'No template yet',
      'chip-unknown',
      'Open their rules to choose one.'
    );
    return;
  }

  addChip(container, ageBandText(preset), 'chip-age');
  addChip(
    container,
    latitudeText(preset),
    isLoose(preset) ? 'chip-loose' : 'chip-tight',
    preset.description || ''
  );
}

/* The picker on the "add someone" card. */
function renderAddPreset() {
  const select = $('add-preset');
  select.textContent = '';

  if (!state.presets.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'The usual rules for a young child';
    select.appendChild(option);
    select.disabled = true;
    $('add-preset-hint').textContent = '';
    return;
  }

  select.disabled = false;
  for (const preset of state.presets) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label || preset.id;
    select.appendChild(option);
  }
  select.value = state.defaultPreset || state.presets[0].id;
  describeAddPreset();
}

function describeAddPreset() {
  const preset = state.presetById[$('add-preset').value];
  $('add-preset-hint').textContent = preset
    ? preset.description || ''
    : '';
}

/* ── people ────────────────────────────────────────────────────── */

function initialOf(name) {
  const trimmed = String(name || '').trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?';
}

function absorbUsers(payload) {
  const users = Array.isArray(payload.users) ? payload.users : payload;
  state.users = (users || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
}

/* The list endpoint may or may not carry each person's template. When it does
   not, ask for it one person at a time — a household is a handful of rows, and
   a tag that silently says nothing is worse than a few small requests. */
async function fillMissingPresets() {
  const missing = state.users.filter((user) => !user.preset);
  if (!missing.length) return;

  await Promise.all(missing.map(async (user) => {
    try {
      const result = await call(`/api/admin/users/${encodeURIComponent(user.id)}/prompts`);
      if (result.ok && result.data && result.data.preset) user.preset = result.data.preset;
    } catch (err) {
      /* signed out, or this build has no per-person rules yet */
    }
  }));
}

async function loadUsers() {
  const result = await call('/api/admin/users');
  if (!result.ok) {
    setNotice($('users-notice'), problem(result, 'Could not load the list of people.'));
    return;
  }
  absorbUsers(result.data || {});
  await fillMissingPresets();
  renderUsers();
  renderRulesPicker();

  /* Their rules cannot stay open if they have just been deleted. */
  if (state.rulesUserId && !userById(state.rulesUserId)) showRulesPicker();

  emit('ashley:admin-data');
}

function renderUsers() {
  const list = $('users-list');
  list.textContent = '';

  if (!state.users.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Nobody has been added yet.';
    list.appendChild(empty);
    return;
  }

  const template = $('tpl-user');

  state.users.forEach((user, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const q = (sel) => node.querySelector(sel);
    let accent = user.accent || ACCENTS[0];

    /* The setup checklist walks a parent to one specific person's row, so
       the rows have to be addressable from outside this loop. */
    node.dataset.userId = user.id;

    q('[data-disc]').style.setProperty('--disc-accent', accent);
    q('[data-initial]').textContent = initialOf(user.display_name);
    q('[data-title]').textContent = user.display_name || 'Someone';
    q('[data-tag]').textContent = user.password_protected
      ? 'Signs in with a password'
      : 'Signs in with one tap';
    renderChips(q('[data-chips]'), user.preset);

    q('[data-rules]').addEventListener('click', () => {
      selectTab('prompts');
      openRules(user.id).catch(() => {});
    });

    /* Real labels need real ids, and a template cannot carry unique ones. */
    const nameId = `u-${user.id}-name`;
    const passwordId = `u-${user.id}-password`;
    q('[data-name]').id = nameId;
    q('[data-label-name]').htmlFor = nameId;
    q('[data-password]').id = passwordId;
    q('[data-label-password]').htmlFor = passwordId;

    q('[data-name]').value = user.display_name || '';
    q('[data-protected]').checked = Boolean(user.password_protected);
    q('[data-password-hint]').textContent = user.password_protected
      ? 'Leave this empty to keep the password they already have.'
      : 'Only needed if you switch the password on.';

    const markSwatch = buildSwatches(q('[data-swatches]'), accent, (colour) => {
      accent = colour;
      q('[data-disc]').style.setProperty('--disc-accent', colour);
    });

    const body = q('[data-body]');
    const toggle = q('[data-toggle]');
    toggle.addEventListener('click', () => {
      const open = body.hidden;
      body.hidden = !open;
      node.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? 'Close' : 'Change';
      if (open) q('[data-name]').focus();
    });

    const up = q('[data-up]');
    const down = q('[data-down]');
    up.disabled = index === 0;
    down.disabled = index === state.users.length - 1;
    up.addEventListener('click', () => moveUser(index, -1));
    down.addEventListener('click', () => moveUser(index, 1));

    const error = q('[data-error]');

    q('[data-save]').addEventListener('click', async () => {
      setNotice(error, '');
      const displayName = q('[data-name]').value.trim();
      if (!displayName) {
        setNotice(error, 'They need a name.');
        return;
      }

      const payload = {
        display_name: displayName,
        accent: accent,
        password_protected: q('[data-protected]').checked
      };
      const password = q('[data-password]').value;
      if (password) payload.password = password;

      const result = await send('PATCH', `/api/admin/users/${encodeURIComponent(user.id)}`, payload);
      if (!result.ok) {
        setNotice(error, problem(result, 'Could not save that.'));
        return;
      }

      q('[data-password]').value = '';
      markSwatch(accent);
      toast(`${displayName} saved.`);
      await loadUsers();
    });

    q('[data-clear-password]').addEventListener('click', async () => {
      setNotice(error, '');
      if (!window.confirm(`Remove ${user.display_name}'s password? They will be able to sign in with one tap.`)) {
        return;
      }
      const result = await send('PATCH', `/api/admin/users/${encodeURIComponent(user.id)}`, {
        password: null,
        password_protected: false
      });
      if (!result.ok) {
        setNotice(error, problem(result, 'Could not remove the password.'));
        return;
      }
      toast('Password removed.');
      await loadUsers();
    });

    q('[data-delete]').addEventListener('click', async () => {
      setNotice(error, '');
      const label = user.display_name || 'this person';
      if (!window.confirm(`Delete ${label} and every conversation they have saved? This cannot be undone.`)) {
        return;
      }
      const result = await call(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      if (!result.ok) {
        setNotice(error, problem(result, 'Could not delete them.'));
        return;
      }
      toast(`${label} deleted.`);
      await loadUsers();
    });

    list.appendChild(node);
  });
}

/* Reordering only ever touches the two rows that swapped. */
async function moveUser(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.users.length) return;

  const a = state.users[index];
  const b = state.users[target];

  setNotice($('users-notice'), '');

  const first = await send('PATCH', `/api/admin/users/${encodeURIComponent(a.id)}`, { order: target });
  if (!first.ok) {
    setNotice($('users-notice'), problem(first, 'Could not change the order.'));
    return;
  }
  const second = await send('PATCH', `/api/admin/users/${encodeURIComponent(b.id)}`, { order: index });
  if (!second.ok) {
    setNotice($('users-notice'), problem(second, 'Could not change the order.'));
  }
  await loadUsers();
}

async function addUser() {
  setNotice($('add-notice'), '');

  const displayName = $('add-name').value.trim();
  if (!displayName) {
    setNotice($('add-notice'), 'Give them a name first.');
    $('add-name').focus();
    return;
  }

  const wantsPassword = $('add-protected').checked;
  const password = $('add-password').value;
  if (wantsPassword && !password) {
    setNotice($('add-notice'), 'Set a password for them, or switch the password off.');
    $('add-password').focus();
    return;
  }

  const payload = {
    display_name: displayName,
    accent: state.addAccent,
    password_protected: wantsPassword
  };
  if (wantsPassword) payload.password = password;

  /* Left out entirely when there is nothing to say, so the server keeps its
     own default rather than being handed an empty string. */
  const preset = $('add-preset').value;
  if (preset) payload.preset = preset;

  const result = await send('POST', '/api/admin/users', payload);
  if (!result.ok) {
    setNotice($('add-notice'), problem(result, 'Could not add them.'));
    return;
  }

  $('add-name').value = '';
  $('add-password').value = '';
  $('add-protected').checked = false;
  $('add-password-field').hidden = true;
  toast(`${displayName} added.`);
  await loadUsers();
}

/* ── config: prompts, model, appearance ────────────────────────── */

async function loadConfig() {
  const result = await call('/api/admin/config');
  if (!result.ok) {
    setNotice($('model-notice'), problem(result, 'Could not load the settings.'));
    return;
  }

  state.config = result.data || {};
  const model = state.config.model || {};
  const appearance = state.config.appearance || {};

  /* config.prompts is no longer edited here: the rules are per person now and
     live behind /api/admin/users/<id>/prompts. */

  $('model-url').value = model.url || '';
  $('model-id').value = model.model || '';
  $('model-timeout').value = model.timeout || 180;
  $('model-key').value = '';
  $('model-key').placeholder = model.api_key_set || model.api_key === REDACTED
    ? `${REDACTED} (leave empty to keep it)`
    : 'Not set';

  state.defaultTheme = appearance.default_theme || 'dark';
  renderThemeCards();

  emit('ashley:admin-data');
}

/* ── rules, one person at a time ───────────────────────────────── */

function userById(id) {
  return state.users.find((user) => user.id === id) || null;
}

/* The "whose rules" list. */
function renderRulesPicker() {
  const list = $('rules-picker-list');
  list.textContent = '';

  if (!state.users.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Add somebody on the People tab first, then their rules appear here.';
    list.appendChild(empty);
    return;
  }

  const template = $('tpl-pick');

  for (const user of state.users) {
    const node = template.content.firstElementChild.cloneNode(true);
    const q = (sel) => node.querySelector(sel);

    q('[data-disc]').style.setProperty('--disc-accent', user.accent || ACCENTS[0]);
    q('[data-initial]').textContent = initialOf(user.display_name);
    q('[data-name]').textContent = user.display_name || 'Someone';

    const preset = state.presetById[user.preset];
    q('[data-sub]').textContent = preset
      ? preset.label || ''
      : 'No template chosen yet';

    renderChips(q('[data-chips]'), user.preset);
    node.addEventListener('click', () => { openRules(user.id).catch(() => {}); });
    list.appendChild(node);
  }
}

function showRulesPicker() {
  state.rulesUserId = null;
  state.rules = null;
  $('rules-detail').hidden = true;
  $('rules-picker').hidden = false;
  setNotice($('rules-notice'), '');
}

async function openRules(userId) {
  const user = userById(userId);
  if (!user) return;

  /* Blank first, so a slow or failed load can never leave the previous
     person's wording sitting under this person's name. */
  state.rulesUserId = userId;
  state.rules = null;
  renderEditors();
  renderCore();

  $('rules-picker').hidden = true;
  $('rules-detail').hidden = false;
  setNotice($('rules-notice'), '');

  $('rules-disc').style.setProperty('--disc-accent', user.accent || ACCENTS[0]);
  $('rules-initial').textContent = initialOf(user.display_name);
  $('rules-name').textContent = user.display_name || 'Someone';
  renderChips($('rules-chips'), user.preset);

  await loadRules(userId);
}

async function loadRules(userId) {
  const result = await call(`/api/admin/users/${encodeURIComponent(userId)}/prompts`);
  if (!result.ok) {
    setNotice($('rules-notice'), problem(result, 'Could not load their rules.'));
    return;
  }

  /* Somebody may have pressed Back while this was in flight. */
  if (state.rulesUserId !== userId) return;

  state.rules = result.data || {};

  const user = userById(userId);
  if (user && state.rules.preset) {
    user.preset = state.rules.preset;
    renderChips($('rules-chips'), user.preset);
  }

  renderPresetCards();
  renderEditors();
  renderCore();
}

function renderPresetCards() {
  const container = $('preset-cards');
  container.textContent = '';

  if (!state.presets.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'The templates could not be loaded, so they cannot be changed here.';
    container.appendChild(empty);
    return;
  }

  const template = $('tpl-preset-card');
  const chosen = (state.rules && state.rules.preset) || '';

  for (const preset of state.presets) {
    const node = template.content.firstElementChild.cloneNode(true);
    const q = (sel) => node.querySelector(sel);

    node.dataset.preset = preset.id;
    node.setAttribute('aria-checked', preset.id === chosen ? 'true' : 'false');
    q('[data-label]').textContent = preset.label || preset.id;
    q('[data-desc]').textContent = preset.description || '';
    renderChips(q('[data-chips]'), preset.id);

    node.addEventListener('click', () => { choosePreset(preset.id).catch(() => {}); });
    container.appendChild(node);
  }
}

async function choosePreset(presetId) {
  const userId = state.rulesUserId;
  if (!userId) return;
  if (state.rules && state.rules.preset === presetId) return;

  /* Switching template reloads both boxes from the server, so anything typed
     and not saved would vanish without a word. Ask first. */
  if (EDITORS.some(isDirty)) {
    const ok = window.confirm(
      'You have changes in a box that are not saved yet. Switching template will lose them. Carry on?'
    );
    if (!ok) return;
  }

  setNotice($('rules-notice'), '');

  const result = await send('PUT', `/api/admin/users/${encodeURIComponent(userId)}/prompts`, {
    preset: presetId
  });
  if (!result.ok) {
    setNotice($('rules-notice'), problem(result, 'Could not change their template.'));
    return;
  }

  const user = userById(userId);
  if (user) user.preset = presetId;
  renderUsers();
  renderRulesPicker();

  await loadRules(userId);

  const preset = state.presetById[presetId];
  toast(preset ? `Now on ${preset.label}.` : 'Template changed.');
}

function editorText(editor) {
  return $(editor.textarea).value;
}

function isDirty(editor) {
  return editorText(editor) !== state.baseline[editor.field];
}

function isOverridden(editor) {
  const flags = (state.rules && state.rules.overridden) || {};
  return Boolean(flags[editor.field]);
}

/* "Using the template" / "Customised" / "Not saved yet" — the one thing a
   parent has to be able to read at a glance on this screen. */
function renderState(editor) {
  const chip = $(editor.stateChip);
  chip.classList.remove('state-template', 'state-custom', 'state-dirty');

  if (isDirty(editor)) {
    chip.classList.add('state-dirty');
    chip.textContent = 'Not saved yet';
  } else if (isOverridden(editor)) {
    chip.classList.add('state-custom');
    chip.textContent = 'Customised';
  } else {
    chip.classList.add('state-template');
    chip.textContent = 'Using the template';
  }

  $(editor.save).disabled = !isDirty(editor);
  $(editor.reset).disabled = !isOverridden(editor) && !isDirty(editor);
}

function renderEditors() {
  const effective = (state.rules && state.rules.effective) || {};

  for (const editor of EDITORS) {
    const text = typeof effective[editor.field] === 'string' ? effective[editor.field] : '';
    $(editor.textarea).value = text;
    state.baseline[editor.field] = text;
    setNotice($(editor.notice), '');
    renderState(editor);
  }

  $('btn-reset-both').disabled = !EDITORS.some(isOverridden);
}

function renderCore() {
  const core = (state.rules && state.rules.safety_core) || '';
  $('rules-core').textContent =
    core || 'Ashley did not send these rules back, but they still apply.';
}

async function saveEditor(editor) {
  const userId = state.rulesUserId;
  if (!userId) return;

  setNotice($(editor.notice), '');
  const text = editorText(editor);

  /* The server refuses a box that is only spaces, and it is right to. Say so
     here rather than letting the press of a button look like it did nothing. */
  if (!text.trim()) {
    setNotice(
      $(editor.notice),
      'This box cannot be left blank. Write something, or press "Reset to template".'
    );
    $(editor.textarea).focus();
    return;
  }

  const body = {};
  body[editor.field] = text;

  const result = await send('PUT', `/api/admin/users/${encodeURIComponent(userId)}/prompts`, body);
  if (!result.ok) {
    setNotice($(editor.notice), problem(result, 'Could not save that.'));
    return;
  }

  await loadRules(userId);
  toast(`${editor.name} saved.`);
}

async function resetEditor(editor) {
  const userId = state.rulesUserId;
  if (!userId) return;

  const user = userById(userId);
  const who = (user && user.display_name) || 'this person';
  const ok = window.confirm(
    `Put "${editor.name}" back to ${who}'s template? Anything written in that box is replaced.`
  );
  if (!ok) return;

  setNotice($(editor.notice), '');

  /* null is what clears an override — an empty string would be a blank prompt,
     which is exactly what the server refuses. */
  const body = {};
  body[editor.field] = null;

  const result = await send('PUT', `/api/admin/users/${encodeURIComponent(userId)}/prompts`, body);
  if (!result.ok) {
    setNotice($(editor.notice), problem(result, 'Could not go back to the template.'));
    return;
  }

  await loadRules(userId);
  toast(`${editor.name} is back to the template.`);
}

async function resetBothEditors() {
  const userId = state.rulesUserId;
  if (!userId) return;

  const user = userById(userId);
  const who = (user && user.display_name) || 'this person';
  if (!window.confirm(`Put both boxes back to ${who}'s template? Anything you have written is replaced.`)) {
    return;
  }

  setNotice($('rules-notice'), '');

  const result = await send('POST', `/api/admin/users/${encodeURIComponent(userId)}/prompts/reset`);
  if (!result.ok) {
    setNotice($('rules-notice'), problem(result, 'Could not go back to the template.'));
    return;
  }

  await loadRules(userId);
  toast('Both boxes are back to the template.');
}

/* Global, not per person: puts the four shipped templates back to Ashley's own
   wording. Anything written for one person stays where it is. */
async function restoreTemplates() {
  const ok = window.confirm(
    'Put all four templates back to the wording Ashley came with? Anything you have written for one person is left alone.'
  );
  if (!ok) return;

  setNotice($('rules-notice'), '');

  const result = await send('POST', '/api/admin/config/reset-prompts');
  if (!result.ok) {
    setNotice($('rules-notice'), problem(result, 'Could not restore the templates.'));
    return;
  }

  setNotice($('rules-notice'), 'The four templates are back to Ashley’s wording.', 'ok');
  await loadPresets();
  renderUsers();
  renderRulesPicker();
  if (state.rulesUserId) await loadRules(state.rulesUserId);
}

async function saveModel() {
  setNotice($('model-notice'), '');

  const url = $('model-url').value.trim();
  if (!url) {
    setNotice($('model-notice'), 'Ashley needs an address to talk to.');
    $('model-url').focus();
    return;
  }

  const timeout = parseInt($('model-timeout').value, 10);
  const model = {
    url,
    model: $('model-id').value.trim(),
    timeout: Number.isFinite(timeout) ? timeout : 180
  };

  /* Empty means "keep the key you already have" — so it is left out of the
     request entirely rather than sent as a blank. */
  const key = $('model-key').value;
  if (key) model.api_key = key;

  const result = await send('PUT', '/api/admin/config', { model });
  if (!result.ok) {
    setNotice($('model-notice'), problem(result, 'Could not save the model settings.'));
    return;
  }

  $('model-key').value = '';
  setNotice($('model-notice'), 'Saved.', 'ok');
  await loadConfig();
}

async function testModel() {
  const box = $('test-result');
  box.hidden = false;
  box.className = 'test-result';
  box.textContent = 'Trying to reach the model…';

  let result;
  try {
    result = await send('POST', '/api/admin/config/test-model');
  } catch (err) {
    if (err.message === 'signed out') return;
    box.className = 'test-result bad';
    box.textContent = 'Cannot reach Ashley itself. Check that the server is running.';
    return;
  }

  box.textContent = '';

  const data = result.data || {};
  if (!result.ok || !data.ok) {
    box.className = 'test-result bad';
    const title = document.createElement('p');
    title.className = 'test-title';
    title.textContent = 'No answer from the model.';
    const detail = document.createElement('p');
    detail.textContent = data.error || 'Check the address, then try again.';
    box.appendChild(title);
    box.appendChild(detail);
    return;
  }

  box.className = 'test-result good';
  const title = document.createElement('p');
  title.className = 'test-title';
  title.textContent = 'Connected. The model answered.';
  box.appendChild(title);

  const models = Array.isArray(data.models) ? data.models : [];
  if (!models.length) {
    const none = document.createElement('p');
    none.textContent = 'It did not list any models by name.';
    box.appendChild(none);
    return;
  }

  const caption = document.createElement('p');
  caption.textContent = `It offers ${models.length} model${models.length === 1 ? '' : 's'}:`;
  box.appendChild(caption);

  const list = document.createElement('ul');
  list.className = 'model-list';
  for (const entry of models) {
    const item = document.createElement('li');
    item.textContent = typeof entry === 'string' ? entry : (entry && entry.id) || String(entry);
    list.appendChild(item);
  }
  box.appendChild(list);
}

/* ── appearance ────────────────────────────────────────────────── */

function renderThemeCards() {
  const container = $('theme-cards');
  if (!window.AshleyTheme) return;

  container.textContent = '';
  const template = $('tpl-theme-card');

  for (const theme of window.AshleyTheme.THEMES) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.theme = theme.id;
    node.querySelector('[data-swatch]').dataset.themeId = theme.id;
    node.querySelector('[data-name]').textContent = theme.name;
    node.querySelector('[data-blurb]').textContent = theme.blurb;
    node.setAttribute('aria-checked', theme.id === state.defaultTheme ? 'true' : 'false');
    node.addEventListener('click', () => {
      state.defaultTheme = theme.id;
      for (const card of container.querySelectorAll('.theme-card')) {
        card.setAttribute('aria-checked', card.dataset.theme === theme.id ? 'true' : 'false');
      }
    });
    container.appendChild(node);
  }
}

async function saveAppearance() {
  setNotice($('appearance-notice'), '');
  const result = await send('PUT', '/api/admin/config', {
    appearance: { default_theme: state.defaultTheme }
  });
  if (!result.ok) {
    setNotice($('appearance-notice'), problem(result, 'Could not save that.'));
    return;
  }
  setNotice($('appearance-notice'), 'Saved. That is what the sign-in screen wears now.', 'ok');
}

function renderDeviceTheme() {
  const select = $('device-theme');
  if (!window.AshleyTheme) return;

  select.textContent = '';
  for (const theme of window.AshleyTheme.THEMES) {
    const option = document.createElement('option');
    option.value = theme.id;
    option.textContent = theme.name;
    select.appendChild(option);
  }
  select.value = window.AshleyTheme.current();
  select.addEventListener('change', () => {
    select.value = window.AshleyTheme.choose(select.value);
  });
}

/* ── admin password ────────────────────────────────────────────── */

async function saveAdminPassword() {
  setNotice($('pw-notice'), '');

  const next = $('pw-new').value;
  const again = $('pw-again').value;

  if (next.length < 8) {
    setNotice($('pw-notice'), 'The new password needs at least 8 characters.');
    $('pw-new').focus();
    return;
  }
  if (next !== again) {
    setNotice($('pw-notice'), 'The two passwords do not match.');
    $('pw-again').focus();
    return;
  }

  const result = await send('POST', '/api/admin/password', { new: next });
  if (!result.ok) {
    setNotice($('pw-notice'), problem(result, 'Could not change the password.'));
    return;
  }

  $('pw-new').value = '';
  $('pw-again').value = '';
  setNotice($('pw-notice'), 'Changed. Keep it somewhere safe.', 'ok');
  toast('Parents’ password changed.');
}

/* ── wiring ────────────────────────────────────────────────────── */

function wire() {
  wireTabs();

  $('gate-form').addEventListener('submit', submitGate);

  $('btn-admin-logout').addEventListener('click', async () => {
    try {
      await send('POST', '/api/admin/logout');
    } catch (err) {
      /* a 401 already sent us back to the gate */
    }
    window.location.assign('/');
  });

  $('add-protected').addEventListener('change', () => {
    $('add-password-field').hidden = !$('add-protected').checked;
    if ($('add-protected').checked) $('add-password').focus();
  });
  $('btn-add-user').addEventListener('click', () => {
    addUser().catch(() => {});
  });

  $('add-preset').addEventListener('change', describeAddPreset);

  $('btn-rules-back').addEventListener('click', showRulesPicker);
  $('btn-reset-both').addEventListener('click', () => { resetBothEditors().catch(() => {}); });
  $('btn-reset-templates').addEventListener('click', () => { restoreTemplates().catch(() => {}); });

  for (const editor of EDITORS) {
    $(editor.textarea).addEventListener('input', () => renderState(editor));
    $(editor.save).addEventListener('click', () => { saveEditor(editor).catch(() => {}); });
    $(editor.reset).addEventListener('click', () => { resetEditor(editor).catch(() => {}); });
  }

  $('btn-save-model').addEventListener('click', () => { saveModel().catch(() => {}); });
  $('btn-test-model').addEventListener('click', () => { testModel().catch(() => {}); });

  $('btn-save-appearance').addEventListener('click', () => { saveAppearance().catch(() => {}); });
  $('btn-save-password').addEventListener('click', () => { saveAdminPassword().catch(() => {}); });

  state.addAccent = ACCENTS[0];
  buildSwatches($('add-swatches'), ACCENTS[0], (colour) => { state.addAccent = colour; });

  renderDeviceTheme();
}

/* ── the surface onboarding.js and tour.js use ──────────────────────
   Reads and navigation only. Every one of these is something the parent
   could do by clicking; none of them writes to the server. */

const AshleyAdmin = {
  /* reads — copies, so a caller cannot mutate this page's state */
  users: () => state.users.map((user) => ({
    id: user.id,
    display_name: user.display_name,
    accent: user.accent,
    preset: user.preset || '',
    password_protected: Boolean(user.password_protected)
  })),
  presets: () => state.presets.slice(),
  preset: (id) => state.presetById[id] || null,
  defaultPreset: () => state.defaultPreset,
  modelUrl: () => (state.config && state.config.model && state.config.model.url) || '',
  signedIn: () => !$('panel').hidden,

  /* navigation */
  selectTab,
  showRulesPicker,

  /* Opens somebody's rules on the Rules tab — the same thing the "Rules"
     button on their row does. */
  openRules: (userId) => {
    selectTab('prompts');
    return openRules(userId).catch(() => {});
  },

  /* Opens somebody's row on the People tab, expanded, and puts it on
     screen. Driving the row's own button rather than duplicating what it
     does keeps this honest if that row ever changes. */
  openUserEditor: (userId) => {
    selectTab('users');
    const row = document.querySelector(`.user-row[data-user-id="${CSS.escape(userId)}"]`);
    if (!row) return false;
    const toggle = row.querySelector('[data-toggle]');
    if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return true;
  },

  /* Focus a control by id, having first opened the section it lives in. */
  focus: (tab, id) => {
    selectTab(tab);
    const node = $(id);
    if (!node) return false;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    node.focus({ preventScroll: true });
    return true;
  },

  /* Re-reads people and settings from the server, then fires
     ashley:admin-data. The checklist calls this for "check again". */
  refresh: async () => {
    try {
      await loadUsers();
      await loadConfig();
    } catch (err) {
      /* a 401 has already put the gate back */
    }
  }
};

window.AshleyAdmin = AshleyAdmin;

async function loadEverything() {
  /* Templates first: the people list cannot say which rules somebody is on
     until it knows what the templates are called. */
  await loadPresets();
  if (signedOut) return;
  await loadUsers();
  if (signedOut) return;
  await loadConfig();
}

async function init() {
  wire();
  renderThemeCards();
  showRulesPicker();

  /* The probe doubles as the gate: no admin session, no panel. */
  try {
    const result = await call('/api/admin/users');
    if (!result.ok) {
      showGate(problem(result, 'Enter the parents’ password to continue.'));
      return;
    }
    showPanel();
    await loadPresets();
    absorbUsers(result.data || {});
    await fillMissingPresets();
    renderUsers();
    renderRulesPicker();
    await loadConfig();
  } catch (err) {
    if (err.message !== 'signed out') {
      showGate('Cannot reach Ashley. Check that the server is running.');
    }
  }
}

init();
