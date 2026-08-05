'use strict';

/* ── the help page ────────────────────────────────────────────────────
   One scrollable page for a parent who is never going to read a repo.

   Deliberately not a wiki: no search, no routing, no export. The whole
   point is that it fits on one page and can be read start to finish in a
   few minutes.

   Every word comes from assets/help_copy.js — the same structure the
   setup checklist and the tour read. Where this page and the panel talk
   about the same feature, they are quoting one sentence, not two copies
   of it that will drift.

   Ashley AI — Copyright (C) 2026 Christopher Thompson. AGPL-3.0-or-later.
   ------------------------------------------------------------------- */

(function () {

  const HELP = window.ASHLEY_HELP;
  if (!HELP) return;

  /* The order a parent needs it in, which is not the order the panel is
     laid out in: what this is, then how the rules work, then the ones
     they will actually go looking for. */
  const ORDER = [
    { id: 'what', kind: 'extra', key: 'what' },
    { id: 'layers', kind: 'extra', key: 'layers' },
    { id: 'presets', kind: 'feature', key: 'templates' },
    { id: 'core', kind: 'feature', key: 'core' },
    { id: 'change-rules', kind: 'feature', key: 'editors' },
    { id: 'reset', kind: 'feature', key: 'resetTemplate' },
    { id: 'accounts', kind: 'feature', key: 'people' },
    { id: 'passwords', kind: 'feature', key: 'passwords' },
    { id: 'parents-password', kind: 'feature', key: 'adminPassword' },
    { id: 'data', kind: 'feature', key: 'dataLocation' },
    { id: 'limits', kind: 'honesty', key: null },
    { id: 'forgot', kind: 'extra', key: 'adminReset' },
    { id: 'trouble', kind: 'extra', key: 'trouble' }
  ];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function section(entry) {
    const node = el('section', 'doc-section');
    node.id = entry.id;

    let title = '';
    let where = '';
    let lines = [];

    if (entry.kind === 'feature') {
      const feature = HELP.feature(entry.key);
      title = feature.title;
      where = feature.where;
      lines = [feature.short].concat(feature.body || []);
    } else if (entry.kind === 'extra') {
      const extra = HELP.extra[entry.key] || { title: entry.key, body: [] };
      title = extra.title;
      lines = extra.body || [];
    } else {
      title = HELP.honesty.title;
    }

    const heading = el('h2', 'doc-h', title);
    heading.tabIndex = -1;
    node.appendChild(heading);

    if (where) node.appendChild(el('p', 'doc-where', 'In the settings: ' + where));

    for (const line of lines) node.appendChild(el('p', 'doc-p', line));

    /* The honesty note keeps its shape here rather than being flattened
       into prose — each point is a separate thing a parent might want to
       come back to. */
    if (entry.kind === 'honesty') {
      node.appendChild(el('p', 'doc-p', HELP.honesty.intro));
      const list = el('ul', 'doc-honesty');
      for (const point of HELP.honesty.points) {
        const item = el('li');
        item.appendChild(el('strong', 'doc-honesty-h', point.h));
        item.appendChild(el('span', null, ' ' + point.p));
        list.appendChild(item);
      }
      node.appendChild(list);
      node.appendChild(el('p', 'doc-p', HELP.honesty.close));
    }

    return { node: node, title: title };
  }

  function build() {
    const host = document.getElementById('doc-sections');
    const toc = document.getElementById('doc-toc');
    if (!host || !toc) return;

    const list = el('ul', 'doc-toc-list');

    for (const entry of ORDER) {
      const built = section(entry);
      host.appendChild(built.node);

      const item = el('li');
      const link = el('a', 'doc-toc-link', built.title);
      link.href = '#' + entry.id;
      item.appendChild(link);
      list.appendChild(item);
    }

    toc.appendChild(el('p', 'doc-toc-title', 'On this page'));
    toc.appendChild(list);
  }

  /* Moving focus to the heading, not just the scroll position, so that
     the table of contents works for somebody on a keyboard or a screen
     reader rather than only for a mouse. */
  function focusOnJump() {
    window.addEventListener('hashchange', () => {
      const id = window.location.hash.replace('#', '');
      const target = document.getElementById(id);
      const heading = target && target.querySelector('.doc-h');
      if (heading) heading.focus({ preventScroll: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { build(); focusOnJump(); });
  } else {
    build();
    focusOnJump();
  }
})();
