# Contributing

Ashley is a small self-hosted app maintained by one person in the time that is left over.
Contributions are welcome; a fast response is not something anyone can promise. If that
arrangement does not suit you, forking is a first-class option and the licence is written to
protect it.

**Do not open a public issue for a safety bypass or a vulnerability.** See
[SECURITY.md](SECURITY.md).

---

## Before you write code

Open an issue first for anything larger than a bug fix. It is a short conversation that
avoids a long wasted afternoon — particularly for anything touching the safety layer, where
a patch that reads as an improvement can quietly remove a property the design depends on.

Read [docs/safety-model.md](docs/safety-model.md) before touching prompt composition,
`/proxy/chat`, or anything under `/api/admin/`.

---

## Platform constraints

These are not style preferences. A patch that breaks one of them breaks the application, and
the first three break it silently.

**Content Security Policy is `script-src 'self'; style-src 'self'` with no `'unsafe-inline'`.**

- No inline `<script>`. Every script is an external file under `frontend/assets/`.
- No `on*=` attribute handlers. Attach listeners in JS.
- No inline `style="…"` attributes and no `<style>` blocks.
- No CDN, no remote fonts, no remote images. Ashley works with the internet unplugged.

A page that violates any of these renders blank or dead in a browser while looking perfectly
fine in your editor. CI greps for all three.

**Every colour resolves through a CSS custom property.** No raw hex in a component rule —
`base.css` defines the tokens, and each of the five themes is a block of overrides on
`:root[data-theme="…"]` and nothing else. A hardcoded colour is invisible until someone
switches theme.

**Python is stdlib plus `flask`, `werkzeug`, `requests`, `gunicorn`.** Adding a dependency
needs a real reason; prefer stdlib. The pipeline additionally has `pydantic` and `requests`
from its base image and should stay within them.

**No JavaScript build step.** No bundler, no framework, no `node_modules`. The JS in
`frontend/assets/` is what the browser gets. Node is used in CI for `--check` only.

**Everything persistent is JSON on disk under `/data`.** There is no database and there is
not going to be one.

**The backend runs one gunicorn worker with threads.** In-process state is fine but must be
guarded by a lock. The rate limiter and the first-run bootstrap depend on there being one
worker; do not add state that assumes otherwise.

---

## Safety invariants

Changing any of these requires a discussion first, not a pull request first.

1. **The frontend can never speak at the guardrail's level.** `/proxy/chat` drops every
   `role: "system"` message except a single leading one beginning `CHARACTER:`. Do not relax
   it, do not add an exception, do not add a second permitted prefix.
2. **The safety prompt is always applied.** Every failure mode of the config — absent,
   unreadable, malformed, blank — falls back to the constants in source. There must remain
   no code path that reaches the model without one.
3. **`SAFETY_CORE` goes last, always.** After the character sheet, after the floor, for every
   preset and every user. Recency wins; this was measured, not assumed.
4. **`SAFETY_CORE` is not editable at runtime.** No API, no config field, no admin route. It
   is a constant in `backend/server.py` and `pipeline/ashley_pipeline.py`. The panel may
   display it read-only.
5. **The wire carries a user id, never prompt text.** Do not add a path that accepts prompt
   content over the network.
6. **Unknown or malformed user id falls back to the most restrictive preset** —
   `child_8_12_restrictive`. Not the configured default, not "no prompt".
7. **Admin endpoints require an admin session.** A user session must never satisfy an admin
   check. The gate is path-based on `/api/admin/`; keep it that way.
8. **Never log conversation content.** Not messages, not completions, not an error body that
   might contain one. Status codes and exception types only.

---

## No personal data

This repository is public. Nothing committed may contain a real person's name, age or
pronouns; a real hostname, domain, or LAN IP; an API key, password or hash; or a real model
file path. Use `example.invalid`, `10.0.0.10`, `/srv/ashley`, `YOUR_MODEL_ID`.

That includes prompt text. The shipped presets name nobody, refer to the child as `{{name}}`,
and use **they/them** throughout. Do not assume a gender for any user anywhere — not in
prompts, not in UI copy, not in documentation.

`.env` is never committed; `.gitignore` covers it. `.env.example` carries placeholders only.

---

## Checks

CI runs these on every push and pull request. Run them locally first — they take seconds.

```bash
# Python parses
python3 -c "import ast; ast.parse(open('backend/server.py').read())"
python3 -c "import ast; ast.parse(open('pipeline/ashley_pipeline.py').read())"

# JavaScript parses
for f in frontend/assets/*.js; do node --check "$f"; done

# No inline script / style / handlers in HTML
grep -nE '<script(?![^>]*\bsrc=)' -P frontend/pages/*.html
grep -nE '<style|[[:space:]]style[[:space:]]*=' frontend/pages/*.html
grep -nE '[[:space:]]on[a-z]+[[:space:]]*=' frontend/pages/*.html
```

The three greps must return **nothing**.

There is no automated test suite. That is an honest gap rather than a considered position —
the app is verified by running it. If you add tests, `pytest` is the obvious choice and a PR
that introduces the harness alongside a fix is welcome.

**Verify a change by exercising it end to end.** A change to prompt composition is verified
by sending a message and reading what came back, not by the code looking right. A green
health check proves a process is running and nothing else.

---

## Pull requests

- One change per PR. A safety-layer change should not arrive alongside a CSS tidy-up.
- Say what you changed and **what you verified**, specifically. "Tested locally" is not a
  claim anyone can act on; "added a user on the Teen · Guided preset, sent three messages,
  confirmed the composed prompt in the pipeline log" is.
- Match the surrounding style: comments explain *why*, not *what*. The existing code has a
  fair number of comments recording a decision or a trap that cost someone an afternoon —
  that is intentional, and worth continuing.
- Keep the diff readable. Do not reformat files you are not otherwise changing.

## Licence of contributions

Ashley is **AGPL-3.0-or-later**, copyright held personally by **Christopher Thompson**. By
submitting a contribution you agree it is licensed under those terms and that you have the
right to submit it. Contributors keep copyright in their own contributions and are listed in
[AUTHORS](AUTHORS).
