'use strict';

/* Ashley themes.
   Loaded in <head> on every page, AFTER the stylesheets and BEFORE the body,
   so data-theme is on <html> before the first paint and nobody ever sees a
   flash of the wrong colours.

   No inline script anywhere: the CSP has no 'unsafe-inline'. */

(function () {
  const STORAGE_KEY = 'ashley.theme';
  const DEFAULT_THEME = 'dark';

  /* Order matters — this is the order they appear in every picker. */
  const THEMES = [
    { id: 'dark', name: 'Midnight', blurb: 'The house look. Violet on near-black.' },
    { id: 'ivory', name: 'Ivory', blurb: 'Warm paper. Easiest on the eyes in daylight.' },
    { id: 'blood', name: 'Blood', blurb: 'Deep red on almost-black.' },
    { id: 'blue', name: 'Deep Blue', blurb: 'Cool navy with a cyan voice.' },
    { id: 'forest', name: 'Forest', blurb: 'Moss and charcoal.' }
  ];

  const IDS = THEMES.map((t) => t.id);

  function isValid(id) {
    return typeof id === 'string' && IDS.indexOf(id) !== -1;
  }

  function stored() {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return isValid(value) ? value : null;
    } catch (err) {
      /* Private mode, or storage disabled. Not fatal — themes just stop
         persisting on this device. */
      return null;
    }
  }

  function remember(id) {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch (err) {
      /* ignore */
    }
  }

  /* The address-bar / status-bar tint follows the theme. Read the resolved
     value rather than keeping a second copy of the palette in JS. */
  function syncMeta() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    try {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue('--void')
        .trim();
      if (value) meta.setAttribute('content', value);
    } catch (err) {
      /* ignore */
    }
  }

  function apply(id) {
    const theme = isValid(id) ? id : DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', theme);
    syncMeta();
    return theme;
  }

  /* Explicit user choice: paint it and keep it on this device. */
  function choose(id) {
    const theme = apply(id);
    remember(theme);
    return theme;
  }

  /* A server-supplied preference (the signed-in user's saved theme, or the
     login screen's default). Authoritative when present, because localStorage
     is per-device and a family shares the device. */
  function adopt(id) {
    if (!isValid(id)) return current();
    return choose(id);
  }

  /* A fallback only used when this device has no remembered choice. */
  function suggest(id) {
    if (stored()) return current();
    return isValid(id) ? apply(id) : current();
  }

  function current() {
    const attr = document.documentElement.getAttribute('data-theme');
    return isValid(attr) ? attr : DEFAULT_THEME;
  }

  function meta(id) {
    for (const theme of THEMES) {
      if (theme.id === id) return theme;
    }
    return THEMES[0];
  }

  /* Runs immediately, at parse time, before <body> exists. */
  apply(stored() || DEFAULT_THEME);

  window.AshleyTheme = {
    THEMES,
    DEFAULT: DEFAULT_THEME,
    isValid,
    current,
    apply,
    choose,
    adopt,
    suggest,
    meta,
    syncMeta
  };
})();
