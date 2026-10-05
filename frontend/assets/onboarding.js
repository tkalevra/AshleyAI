'use strict';

/* ── the setup checklist ──────────────────────────────────────────────
   Six things worth doing on a new install, shown at the top of the
   parents' settings.

   It is not a slideshow. Every step sends the parent to the real control,
   and every step decides for itself whether it is done by looking at
   something real: an actual probe of the model, the actual list of
   people, the preset actually stored against each of them. Pressing
   "next" does not tick anything, because there is no "next".

   Three of the six cannot be answered by the server, and they are the
   three that are a judgement rather than a setting: whether the parent
   has read what these controls do, whether they have decided about
   passwords, and whether they have had a conversation themselves. Those
   are recorded as the parent's own word, and the copy says so.

   WHERE PROGRESS IS KEPT — read this before "fixing" it.
   In localStorage, per browser. The backend has no key/value store and
   no endpoint that would take one: PUT /api/admin/config accepts exactly
   `prompts`, `model` and `appearance` and silently drops anything else,
   so there is nowhere on the server to put this without a backend change
   that is not ours to make. The consequence, stated rather than hidden:
   a parent who sets Ashley up on a tablet and then opens the settings on
   a laptop sees the three judgement steps unticked again. The three
   measured steps are re-measured and tick immediately. That is the right
   failure — the worst case is being asked to read the honesty note twice.

   No inline handlers, no innerHTML: the CSP has no 'unsafe-inline', and
   nothing that came from a person is ever parsed as markup.

   Ashley AI — AGPL-3.0-or-later. Copyright and license: see the LICENSE file.
   ------------------------------------------------------------------- */

(function () {

  const HELP = window.ASHLEY_HELP;
  if (!HELP) return;

  const STORE_KEY = 'ashley.onboarding.v1';

  const $ = (id) => document.getElementById(id);

  /* ── tiny DOM helpers ───────────────────────────────────────────── */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function button(label, className, onClick) {
    const node = el('button', className || 'btn btn-ghost btn-compact', label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function paragraphs(container, lines) {
    for (const line of lines || []) container.appendChild(el('p', 'setup-p', line));
  }

  /* ── progress, on this device ───────────────────────────────────── */

  function readProgress() {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      /* private mode, disabled storage, or somebody hand-edited it */
      return {};
    }
  }

  function writeProgress(next) {
    progress = next;
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch (err) {
      /* Nothing to do but carry on: the checklist still works for this
         visit, it just will not be remembered. */
    }
  }

  function record(key, value) {
    const next = Object.assign({}, progress);
    next[key] = value;
    writeProgress(next);
    render();
  }

  function recordFor(key, id, value) {
    const branch = Object.assign({}, progress[key] || {});
    branch[id] = value;
    record(key, branch);
  }

  let progress = readProgress();

  /* Live, per-visit: the safety core text once we have somewhere to read
     it from, and whether the model probe is in flight. */
  let safetyCore = '';
  let probing = false;
  let probeError = '';
  let openStep = null;
  let autoProbed = false;

  /* ── transport ──────────────────────────────────────────────────── */

  async function api(path, options) {
    const response = await fetch(path, Object.assign({ credentials: 'same-origin' }, options || {}));
    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      data = null;
    }
    return { ok: response.ok, status: response.status, data: data || {} };
  }

  function admin() {
    return window.AshleyAdmin || null;
  }

  function users() {
    const a = admin();
    return a ? a.users() : [];
  }

  /* ── the live signals ───────────────────────────────────────────────
     One function per step. Each returns:
       { done, summary, warn }
     `done` decides the tick. `summary` is the one line shown next to the
     step when it is collapsed. `warn` marks a step that is technically
     answerable but has something the parent should look at. */

  const SIGNALS = {

    /* Measured. A stored result is only trusted while the address it was
       taken against is still the address in the settings — moving the
       model invalidates the answer, which is exactly the case where a
       stale green tick would be worst. */
    model() {
      const url = (admin() && admin().modelUrl()) || '';
      const stored = progress.model || null;
      const fresh = stored && stored.ok && stored.url === url && url;

      if (probing) return { done: false, summary: 'Checking…' };
      if (!url) return { done: false, summary: 'No address set yet.' };
      if (fresh) return { done: true, summary: `Answered at ${url}` };
      if (probeError) return { done: false, summary: probeError };
      if (stored && stored.url !== url) {
        return { done: false, summary: 'The address changed since the last check.' };
      }
      return { done: false, summary: 'Not checked yet.' };
    },

    /* The parent's own word, and it should be: nothing a server can see
       tells you whether somebody read something. Tied to the version of
       the wording, so a materially different statement is read again. */
    safety() {
      const ack = progress.ack_safety || null;
      if (ack && ack.v === HELP.ACK_VERSION) {
        return { done: true, summary: 'Read and acknowledged.' };
      }
      if (ack) return { done: false, summary: 'This has changed since you read it.' };
      return { done: false, summary: 'Not read yet.' };
    },

    /* Measured. */
    accounts() {
      const list = users();
      if (!list.length) return { done: false, summary: 'Nobody has been added yet.' };
      const names = list.map((u) => u.display_name || 'Someone').join(', ');
      return {
        done: true,
        summary: list.length === 1 ? `One account: ${names}` : `${list.length} accounts: ${names}`,
        warn: list.length === 1
      };
    },

    /* Measured, plus one judgement.

       A preset stored against every person is necessary but not enough:
       the shipped default is also a stored preset, and "they were left on
       whatever came out of the box" is the state this whole page exists
       to catch. So somebody on the default counts as reviewed only once
       the parent has said so; somebody moved off it has been reviewed by
       the act of moving them. */
    presets() {
      const list = users();
      if (!list.length) return { done: false, summary: 'Add someone first.' };

      const missing = list.filter((u) => !u.preset);
      if (missing.length) {
        return {
          done: false,
          summary: `${missing.length} without any rules: ${missing.map((u) => u.display_name).join(', ')}`
        };
      }

      const unreviewed = list.filter((u) => !presetReviewed(u));
      if (unreviewed.length) {
        return {
          done: false,
          warn: true,
          summary: `${unreviewed.length} still on the rules they were created with: ` +
            unreviewed.map((u) => u.display_name).join(', ')
        };
      }
      return { done: true, summary: 'Every person has rules you have looked at.' };
    },

    /* The parent's own word, per person, and re-asked if the setting
       changes underneath it. */
    passwords() {
      const list = users();
      if (!list.length) return { done: false, summary: 'Add someone first.' };
      const undecided = list.filter((u) => !passwordDecided(u));
      if (undecided.length) {
        return {
          done: false,
          summary: `${undecided.length} not decided: ${undecided.map((u) => u.display_name).join(', ')}`
        };
      }
      const withPassword = list.filter((u) => u.password_protected).length;
      return {
        done: true,
        summary: withPassword
          ? `${withPassword} of ${list.length} sign in with a password.`
          : 'Everyone signs in with one tap.'
      };
    },

    /* The parent's own word, and it cannot be anything else: these
       settings deliberately cannot see anyone's conversations. */
    firstchat() {
      if (progress.first_chat) return { done: true, summary: 'You have tried it yourself.' };
      return { done: false, summary: 'Not yet.' };
    }
  };

  /* What a tick on this step actually means. Shown inside every step,
     because a checklist that will not say how it decided is asking to be
     trusted rather than read. */
  const BASIS = {
    model: 'Ticks when Ashley asks that machine and it answers.',
    safety: 'Ticks when you say you have read it. Nothing can check that for you.',
    accounts: 'Ticks when at least one account exists.',
    presets: 'Ticks when everybody has rules, and none of them is one you have ' +
      'not looked at.',
    passwords: 'Ticks when you have said, for each person, that the setting is ' +
      'the one you want.',
    firstchat: 'Ticks on your word. These settings cannot see anybody\'s ' +
      'conversations, and should not be able to.'
  };

  function presetReviewed(user) {
    const a = admin();
    const fallback = a ? a.defaultPreset() : '';
    if (user.preset && fallback && user.preset !== fallback) return true;
    const noted = (progress.presets || {})[user.id];
    return Boolean(noted && noted.preset === user.preset);
  }

  function passwordDecided(user) {
    const noted = (progress.passwords || {})[user.id];
    return Boolean(noted && noted.protected === Boolean(user.password_protected));
  }

  /* ── the model probe ────────────────────────────────────────────── */

  async function probeModel() {
    if (probing) return;
    probing = true;
    probeError = '';
    render();

    const url = (admin() && admin().modelUrl()) || '';
    try {
      const result = await api('/api/admin/config/test-model', { method: 'POST' });
      if (result.status === 401) {
        probing = false;
        return;                       /* the panel's own gate takes over */
      }
      if (result.ok && result.data && result.data.ok) {
        probing = false;
        record('model', { ok: true, url: url, at: Date.now() });
        return;
      }
      probeError = (result.data && result.data.error) || 'No answer from the model.';
    } catch (err) {
      probeError = 'Cannot reach Ashley itself. Check that the server is running.';
    }
    probing = false;
    render();
  }

  /* The read-only safety core is only reachable through a person's
     prompts, so it can only be shown once somebody exists. Fetched once
     per visit, and its absence is never fatal — the acknowledgement is
     about the plain-language statement, which is ours and always there. */
  async function loadSafetyCore() {
    if (safetyCore) return;
    const list = users();
    if (!list.length) return;
    try {
      const result = await api(`/api/admin/users/${encodeURIComponent(list[0].id)}/prompts`);
      if (result.ok && typeof result.data.safety_core === 'string') {
        safetyCore = result.data.safety_core.trim();
        render();
      }
    } catch (err) {
      /* leave it empty; the step still works */
    }
  }

  /* ── what each step offers once it is opened ────────────────────── */

  const DETAIL = {

    model(body, actions) {
      const url = (admin() && admin().modelUrl()) || '';
      const line = el('p', 'setup-p setup-fact');
      line.appendChild(el('span', 'setup-fact-label', 'Address: '));
      line.appendChild(el('span', 'setup-fact-value', url || 'not set'));
      body.appendChild(line);

      if (probeError) {
        const bad = el('p', 'setup-result bad', probeError);
        body.appendChild(bad);
      }

      actions.appendChild(button(
        probing ? 'Checking…' : 'Test the connection',
        'btn btn-primary btn-compact',
        () => { probeModel(); }
      ));
      actions.appendChild(button('Open the Model settings', 'btn btn-ghost btn-compact', () => {
        if (admin()) admin().focus('model', 'model-url');
      }));
    },

    safety(body, actions) {
      const honesty = HELP.honesty;

      body.appendChild(el('p', 'setup-p', honesty.intro));

      const list = el('ul', 'setup-honesty');
      for (const point of honesty.points) {
        const item = el('li');
        item.appendChild(el('strong', 'setup-honesty-h', point.h));
        item.appendChild(el('span', 'setup-honesty-p', ' ' + point.p));
        list.appendChild(item);
      }
      body.appendChild(list);
      body.appendChild(el('p', 'setup-p', honesty.close));

      if (safetyCore) {
        const heading = el('p', 'setup-p setup-sub', HELP.feature('core').title);
        body.appendChild(heading);
        const pre = el('pre', 'core-text', safetyCore);
        pre.tabIndex = 0;
        pre.setAttribute('role', 'region');
        pre.setAttribute('aria-label', 'The rules that are always on, read only');
        body.appendChild(pre);
      } else {
        body.appendChild(el('p', 'setup-p setup-muted',
          'The exact wording of those rules is shown under any person\'s ' +
          'rules, once somebody has been added.'));
      }

      const ack = progress.ack_safety;
      if (ack && ack.v === HELP.ACK_VERSION) {
        actions.appendChild(el('p', 'setup-p setup-muted', 'You have read this.'));
        actions.appendChild(button('Read it again', 'btn btn-ghost btn-compact', () => {
          record('ack_safety', null);
        }));
        return;
      }

      actions.appendChild(button(honesty.confirm, 'btn btn-primary btn-compact', () => {
        record('ack_safety', { v: HELP.ACK_VERSION, at: Date.now() });
      }));
    },

    accounts(body, actions) {
      const list = users();
      if (list.length) {
        body.appendChild(peopleList(list, (user) => el('span', 'setup-person-sub',
          user.password_protected ? 'Signs in with a password' : 'Signs in with one tap')));
      }
      if (list.length === 1) {
        body.appendChild(el('p', 'setup-p setup-muted',
          'If more than one child uses this, add them now — sharing an ' +
          'account means sharing one set of rules.'));
      }
      actions.appendChild(button('Add someone', 'btn btn-primary btn-compact', () => {
        if (admin()) admin().focus('users', 'add-name');
      }));
    },

    presets(body, actions) {
      const list = users();
      if (!list.length) {
        body.appendChild(el('p', 'setup-p setup-muted', 'Nobody to set rules for yet.'));
        return;
      }

      const a = admin();
      const fallback = a ? a.defaultPreset() : '';

      body.appendChild(peopleList(list, (user) => {
        const wrap = el('span', 'setup-person-sub');
        const preset = a ? a.preset(user.preset) : null;
        wrap.textContent = preset ? (preset.label || preset.id) : 'No rules chosen yet';
        return wrap;
      }, (user, row) => {
        const reviewed = presetReviewed(user);
        row.appendChild(el('span',
          'state-chip ' + (reviewed ? 'state-custom' : 'state-dirty'),
          reviewed ? 'Looked at' : 'Not looked at'));

        const rowActions = el('span', 'setup-person-actions');
        rowActions.appendChild(button('Open their rules', 'btn btn-ghost btn-compact', () => {
          if (admin()) admin().openRules(user.id);
        }));
        if (!reviewed) {
          rowActions.appendChild(button('This is right for them', 'btn btn-ghost btn-compact', () => {
            recordFor('presets', user.id, { preset: user.preset, at: Date.now() });
          }));
        }
        row.appendChild(rowActions);
      }));

      if (fallback) {
        const preset = a ? a.preset(fallback) : null;
        body.appendChild(el('p', 'setup-p setup-muted',
          'New accounts start on ' + (preset ? (preset.label || fallback) : 'the shipped default') +
          '. Somebody left on it has not necessarily been thought about, ' +
          'which is why this step asks.'));
      }
    },

    passwords(body, actions) {
      const list = users();
      if (!list.length) {
        body.appendChild(el('p', 'setup-p setup-muted', 'Nobody to decide about yet.'));
        return;
      }

      body.appendChild(peopleList(list, (user) => el('span', 'setup-person-sub',
        user.password_protected
          ? 'Asks for a password when they sign in'
          : 'Signs in with one tap'
      ), (user, row) => {
        const decided = passwordDecided(user);
        row.appendChild(el('span',
          'state-chip ' + (decided ? 'state-custom' : 'state-dirty'),
          decided ? 'Decided' : 'Not decided'));

        const rowActions = el('span', 'setup-person-actions');
        if (!decided) {
          rowActions.appendChild(button('That is the choice', 'btn btn-ghost btn-compact', () => {
            recordFor('passwords', user.id, {
              protected: Boolean(user.password_protected),
              at: Date.now()
            });
          }));
        }
        rowActions.appendChild(button('Change it', 'btn btn-ghost btn-compact', () => {
          if (admin()) admin().openUserEditor(user.id);
        }));
        row.appendChild(rowActions);
      }));

      body.appendChild(el('p', 'setup-p setup-muted',
        'A password keeps a child\'s conversations from their siblings. It ' +
        'does not keep them from you — every conversation is a plain file ' +
        'on this machine.'));
    },

    firstchat(body, actions) {
      const link = el('a', 'btn btn-primary btn-compact', 'Open Ashley');
      link.href = '/app';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      actions.appendChild(link);

      if (progress.first_chat) {
        actions.appendChild(button('Not done after all', 'btn btn-ghost btn-compact', () => {
          record('first_chat', null);
        }));
      } else {
        actions.appendChild(button('I have talked to a character', 'btn btn-ghost btn-compact', () => {
          record('first_chat', { at: Date.now() });
        }));
      }

      body.appendChild(el('p', 'setup-p setup-muted',
        'This is the one step these settings cannot check for you, and ' +
        'that is deliberate: the settings page cannot see anybody\'s ' +
        'conversations.'));
    }
  };

  /* A list of people, with an optional extra column per row. */
  function peopleList(list, subFn, extraFn) {
    const wrap = el('ul', 'setup-people');
    for (const user of list) {
      const item = el('li', 'setup-person');

      const disc = el('span', 'disc disc-sm');
      disc.style.setProperty('--disc-accent', user.accent || 'var(--accent)');
      const initial = el('span', 'disc-initial',
        (user.display_name || '?').trim().slice(0, 1).toUpperCase() || '?');
      disc.appendChild(initial);
      item.appendChild(disc);

      const text = el('span', 'setup-person-text');
      text.appendChild(el('span', 'setup-person-name', user.display_name || 'Someone'));
      if (subFn) text.appendChild(subFn(user));
      item.appendChild(text);

      if (extraFn) extraFn(user, item);
      wrap.appendChild(item);
    }
    return wrap;
  }

  /* ── render ─────────────────────────────────────────────────────── */

  function render() {
    const card = $('setup-card');
    if (!card) return;
    if (!admin() || !admin().signedIn()) {
      card.hidden = true;
      return;
    }
    card.hidden = false;

    const list = $('setup-steps');
    list.textContent = '';

    const template = $('tpl-setup-step');
    let doneCount = 0;

    for (const step of HELP.steps) {
      const feature = HELP.feature(step.feature);
      const signal = (SIGNALS[step.id] || (() => ({ done: false, summary: '' })))();
      if (signal.done) doneCount += 1;

      const node = template.content.firstElementChild.cloneNode(true);
      const q = (sel) => node.querySelector(sel);

      node.classList.toggle('is-done', Boolean(signal.done));
      node.classList.toggle('is-warn', Boolean(signal.warn) && !signal.done);

      q('[data-title]').textContent = feature.title;
      q('[data-lead]').textContent = step.lead;
      q('[data-summary]').textContent = signal.summary || '';

      const chip = q('[data-state]');
      chip.textContent = signal.done ? 'Done' : 'To do';
      chip.classList.add(signal.done ? 'state-custom' : 'state-dirty');

      const head = q('[data-head]');
      const body = q('[data-body]');
      const open = openStep === step.id;
      body.hidden = !open;
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      head.addEventListener('click', () => {
        openStep = open ? null : step.id;
        render();
      });

      if (open) {
        const detail = q('[data-detail]');
        const actions = q('[data-actions]');
        detail.appendChild(el('p', 'setup-p', feature.short));
        detail.appendChild(el('p', 'setup-p setup-why', step.why));
        const build = DETAIL[step.id];
        if (build) build(detail, actions);
        if (BASIS[step.id]) detail.appendChild(el('p', 'setup-basis', BASIS[step.id]));
      }

      list.appendChild(node);
    }

    const total = HELP.steps.length;
    $('setup-count').textContent = `${doneCount} of ${total} done`;
    $('setup-meter').style.setProperty('--fill', `${Math.round((doneCount / total) * 100)}%`);
    card.classList.toggle('is-complete', doneCount === total);
  }

  /* ── open / close the whole card ────────────────────────────────── */

  function setCollapsed(collapsed) {
    const card = $('setup-card');
    if (!card) return;
    card.classList.toggle('is-collapsed', collapsed);
    $('setup-body').hidden = collapsed;
    $('setup-toggle').setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    try {
      window.localStorage.setItem('ashley.onboarding.collapsed', collapsed ? '1' : '0');
    } catch (err) {
      /* ignore */
    }
  }

  function collapsedByDefault() {
    try {
      const stored = window.localStorage.getItem('ashley.onboarding.collapsed');
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch (err) {
      /* ignore */
    }
    /* First visit: open if there is anything left to do. */
    return HELP.steps.every((step) => {
      const signal = (SIGNALS[step.id] || (() => ({ done: false })))();
      return signal.done;
    });
  }

  function restart() {
    const ok = window.confirm(
      'Start the setup checklist again? The three steps that record your ' +
      'own answer are cleared. Nothing about the children or their rules ' +
      'is changed.'
    );
    if (!ok) return;
    writeProgress({});
    openStep = HELP.steps.length ? HELP.steps[0].id : null;
    autoProbed = false;
    setCollapsed(false);
    refresh();
  }

  async function refresh() {
    if (admin()) await admin().refresh();
    render();
  }

  /* ── wiring ─────────────────────────────────────────────────────── */

  function wire() {
    const toggle = $('setup-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      setCollapsed(!$('setup-card').classList.contains('is-collapsed'));
    });

    $('setup-recheck').addEventListener('click', () => { refresh(); });
    $('setup-restart').addEventListener('click', restart);
  }

  function onData() {
    render();
    loadSafetyCore();

    /* One probe per visit, and only when there is nothing trustworthy
       stored — this reaches out over the network, so it should not fire
       on every page load once the answer is known. */
    if (!autoProbed && admin() && admin().modelUrl()) {
      const signal = SIGNALS.model();
      if (!signal.done && !probeError) {
        autoProbed = true;
        probeModel();
      }
    }
  }

  /* Opens the first step that is not done, so a parent arriving at an
     incomplete checklist is looking at the thing to do rather than at six
     closed rows. */
  function openFirstUnfinished() {
    for (const step of HELP.steps) {
      const signal = (SIGNALS[step.id] || (() => ({ done: false })))();
      if (!signal.done) {
        openStep = step.id;
        return;
      }
    }
    openStep = null;
  }

  document.addEventListener('ashley:admin-open', () => {
    setCollapsed(collapsedByDefault());
    openFirstUnfinished();
    render();
  });
  document.addEventListener('ashley:admin-closed', render);
  document.addEventListener('ashley:admin-data', onData);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
