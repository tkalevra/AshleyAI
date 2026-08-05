'use strict';

/* ── the guided tour ──────────────────────────────────────────────────
   A passive "where things live" explainer for the parents' settings,
   launched from the "?" in the header and re-runnable at any time. It
   changes nothing: it opens sections and points at controls.

   ⚠️  THE TRAP THIS FILE IS BUILT AROUND — do not remove the guard.

   A step's target existing is NOT enough. This panel is a set of tab
   panels plus one section (a person's rules) that is itself hidden until
   somebody is chosen, so several perfectly real elements are display:none
   most of the time. Point a spotlight at one of those and it lands on a
   zero-sized box in the top-left corner and highlights nothing, while
   every "does this selector match?" check says the step is fine.

   So each step declares both the target AND what has to be revealed
   first, and after revealing, `firstVisible()` re-checks that the element
   is actually on screen. A step whose target is still not visible is
   SKIPPED rather than shown against nothing.

   MEMBERSHIP AUDIT — every target against the panel that reveals it
   (checked against pages/admin.html, and re-check it if that file moves):

     sections      .tabs                 always visible, in no tab panel
     people        #users-list           #sec-users        ← tab "users"
     addPerson     .add-card             #sec-users        ← tab "users"
     whoseRules    #rules-picker-list    #sec-prompts > #rules-picker
     resetTemplate #btn-reset-templates  #sec-prompts > #rules-picker
     templates     #preset-cards         #sec-prompts > #rules-detail *
     editors       #rules-guardrail      #sec-prompts > #rules-detail *
     core          .core                 #sec-prompts > #rules-detail *
     model         #model-url            #sec-model        ← tab "model"
     appearance    #theme-cards          #sec-appearance   ← tab "appearance"
     adminPassword #pw-new               #sec-password     ← tab "password"
     setup         #setup-card           above the tabs, in no tab panel

     * #rules-detail is hidden until a person is opened, and #rules-picker
       is hidden while it is shown — the two are mutually exclusive. Those
       three steps therefore open the first person's rules, and are
       skipped entirely when no accounts exist yet.

   Ashley AI — Copyright (C) 2026 Christopher Thompson. AGPL-3.0-or-later.
   ------------------------------------------------------------------- */

(function () {

  const HELP = window.ASHLEY_HELP;
  if (!HELP) return;

  const $ = (id) => document.getElementById(id);

  function admin() {
    return window.AshleyAdmin || null;
  }

  /* ── step mechanics, keyed by the ids in ASHLEY_HELP.tour ────────
     Copy lives in help_copy.js. This table holds only what the DOM needs:
     which selector to point at, and what to open first so that selector
     is on screen. */

  const MECHANICS = {
    sections: { targets: ['#panel .tabs'] },

    people: {
      tab: 'users',
      targets: ['#users-list .user-row', '#users-list', '.add-card']
    },

    addPerson: { tab: 'users', targets: ['.add-card'] },

    whoseRules: {
      tab: 'prompts',
      picker: true,
      targets: ['#rules-picker-list', '#rules-picker']
    },

    resetTemplate: {
      tab: 'prompts',
      picker: true,
      targets: ['#btn-reset-templates']
    },

    templates: { tab: 'prompts', person: true, targets: ['#preset-cards'] },
    editors: { tab: 'prompts', person: true, targets: ['#rules-guardrail'] },
    core: { tab: 'prompts', person: true, targets: ['#sec-prompts .core'] },

    model: { tab: 'model', targets: ['#model-url'] },
    appearance: { tab: 'appearance', targets: ['#theme-cards'] },
    adminPassword: { tab: 'password', targets: ['#pw-new'] },
    setup: { targets: ['#setup-card'] }
  };

  let index = 0;
  let running = false;
  let openedAPerson = false;      /* so the tour can put the panel back */
  let lastFocus = null;

  /* ── visibility ─────────────────────────────────────────────────── */

  function isVisible(node) {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    /* offsetParent is null for display:none (and for position:fixed, which
       nothing we target is). */
    return node.offsetParent !== null;
  }

  function firstVisible(selectors) {
    for (const selector of selectors || []) {
      const node = document.querySelector(selector);
      if (isVisible(node)) return node;
    }
    return null;
  }

  function nextFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  /* ── revealing ──────────────────────────────────────────────────── */

  async function reveal(mech) {
    const a = admin();
    if (!a) return;

    if (mech.tab) a.selectTab(mech.tab);

    if (mech.picker) {
      a.showRulesPicker();
    } else if (mech.person) {
      const list = a.users();
      if (!list.length) return;              /* the step will be skipped */
      openedAPerson = true;
      await a.openRules(list[0].id);
    }

    await nextFrame();
  }

  /* ── placing the spotlight ──────────────────────────────────────── */

  let currentTarget = null;

  function place(node) {
    currentTarget = node;
    const spot = $('tour-spot');
    const pop = $('tour-pop');
    if (!node || !spot || !pop) return;

    const rect = node.getBoundingClientRect();
    const pad = 8;

    /* Custom properties, not a style attribute: the CSP forbids inline
       style attributes but element.style.setProperty is ordinary DOM. */
    spot.style.setProperty('--x', `${Math.max(rect.left - pad, 4)}px`);
    spot.style.setProperty('--y', `${Math.max(rect.top - pad, 4)}px`);
    spot.style.setProperty('--w', `${Math.min(rect.width + pad * 2, window.innerWidth - 8)}px`);
    spot.style.setProperty('--h', `${rect.height + pad * 2}px`);

    /* Below the target when there is room, above it when there is not.
       On a phone the stylesheet overrides both and pins the card to the
       bottom of the screen instead. */
    const popRect = pop.getBoundingClientRect();
    const width = popRect.width || 320;
    const height = popRect.height || 200;
    const below = rect.bottom + 14;
    const above = rect.top - height - 14;
    const top = below + height < window.innerHeight - 8 || above < 8 ? below : above;
    const left = Math.min(
      Math.max(rect.left, 12),
      Math.max(window.innerWidth - width - 12, 12)
    );

    pop.style.setProperty('--px', `${Math.round(left)}px`);
    pop.style.setProperty('--py', `${Math.round(Math.max(top, 8))}px`);
  }

  function reposition() {
    if (running && currentTarget) place(currentTarget);
  }

  /* ── steps ──────────────────────────────────────────────────────── */

  async function show(direction) {
    if (!running) return;

    while (index >= 0 && index < HELP.tour.length) {
      const step = HELP.tour[index];
      const mech = MECHANICS[step.id] || {};

      await reveal(mech);
      const target = firstVisible(mech.targets);

      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await nextFrame();
        paint(step, target);
        return;
      }

      /* Nothing to point at — usually "no accounts exist yet", which is a
         legitimate state, not a bug. Move on in the direction of travel
         rather than spotlighting a hidden element. */
      index += direction < 0 ? -1 : 1;
    }

    stop();
  }

  function paint(step, target) {
    const feature = HELP.feature(step.feature);

    $('tour-where').textContent = feature.where || '';
    $('tour-title').textContent = feature.title;
    $('tour-copy').textContent = step.note || feature.short;
    $('tour-count').textContent = `${index + 1} of ${HELP.tour.length}`;

    $('tour-prev').disabled = index === 0;
    $('tour-next').textContent = index === HELP.tour.length - 1 ? 'Finish' : 'Next';

    place(target);
    $('tour-pop').focus({ preventScroll: true });
  }

  /* ── start / stop ───────────────────────────────────────────────── */

  function start() {
    if (!admin() || !admin().signedIn()) return;
    lastFocus = document.activeElement;
    running = true;
    openedAPerson = false;
    index = 0;
    $('tour').hidden = false;
    document.body.classList.add('tour-open');
    show(1);
  }

  function stop() {
    running = false;
    currentTarget = null;
    $('tour').hidden = true;
    document.body.classList.remove('tour-open');

    /* Put the Rules section back the way it was found. The tour is meant
       to change nothing; leaving somebody's rules open is a change. */
    if (openedAPerson && admin()) admin().showRulesPicker();
    openedAPerson = false;

    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
    lastFocus = null;
  }

  function step(delta) {
    index += delta;
    if (index < 0) {
      index = 0;
      return;
    }
    if (index >= HELP.tour.length) {
      stop();
      return;
    }
    show(delta);
  }

  /* ── keyboard ───────────────────────────────────────────────────── */

  function onKeydown(event) {
    if (!running) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      stop();
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
      return;
    }
    if (event.key !== 'Tab') return;

    /* Keep Tab inside the card. Everything behind it is dimmed and not
       meant to be reachable while the tour is up. */
    const focusable = Array.prototype.filter.call(
      $('tour-pop').querySelectorAll('button'),
      (node) => !node.disabled
    );
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === $('tour-pop'))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ── wiring ─────────────────────────────────────────────────────── */

  function wire() {
    const launcher = $('btn-tour');
    if (!launcher || !$('tour')) return;

    launcher.addEventListener('click', start);
    $('tour-next').addEventListener('click', () => step(1));
    $('tour-prev').addEventListener('click', () => step(-1));
    $('tour-done').addEventListener('click', stop);
    $('tour-scrim').addEventListener('click', stop);

    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    /* Signing out mid-tour would leave the spotlight over a password
       prompt. */
    document.addEventListener('ashley:admin-closed', () => {
      if (running) stop();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
