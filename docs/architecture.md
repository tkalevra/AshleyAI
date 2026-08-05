# Architecture

How Ashley is put together, what talks to what, and where the trust boundary sits.

---

## The parts

Two containers on one bridge network, plus a model endpoint that is not Ashley's problem.

```
                    ┌──────────────────────────────────────────┐
   browser ────────▶│ ashley-backend        (Flask + gunicorn) │
   (family LAN)     │                                          │
                    │  · serves the frontend (static, RO mount)│
                    │  · sessions, users, per-user passwords   │
                    │  · the /admin API (separate session kind)│
                    │  · /proxy/chat — strips system messages  │
                    │  · writes /data/config/config.json       │
                    └───────────────────┬──────────────────────┘
                                        │  POST, bearer ASHLEY_PIPELINE_KEY
                                        │  body carries an ashley_user_id
                                        ▼
                    ┌──────────────────────────────────────────┐
                    │ ashley-pipeline   (open-webui/pipelines) │
                    │                                          │
                    │  · one file: pipeline/ashley_pipeline.py │
                    │  · resolves the user's preset + overrides│
                    │  · composes the system prompt            │
                    │  · appends SAFETY_CORE last              │
                    │  · reads config.json READ-ONLY           │
                    └───────────────────┬──────────────────────┘
                                        │  POST /v1/chat/completions
                                        ▼
                          your LLM endpoint (llama.cpp, Ollama, …)
```

**`ashley-backend`** is a single Flask app (`backend/server.py`) on gunicorn with **one
worker and eight threads**. One worker is deliberate: the login rate limiter and the
first-run credential bootstrap are process-local state, and this app serves one household.
Threads cover the long model calls. If you scale it to multiple workers, the rate limiter
becomes per-worker and stops meaning what it says.

**`ashley-pipeline`** is the upstream `ghcr.io/open-webui/pipelines` image with one Python
file mounted into it. It is bound to **loopback only** on the host; the backend reaches it
by service name over the internal network. Nothing on the LAN can address it directly.

There is **no database**. Everything is JSON on disk.

---

## The request path for one message

1. The child types into `/app`. The frontend assembles the conversation and posts it to
   `POST /proxy/chat` with the session cookie.
2. The backend **normalises the payload**. Only `user` and `assistant` turns survive, plus
   **at most one** `system` message, and only if it begins with `CHARACTER:`. Every other
   system message is discarded, not forwarded. Length caps apply: 200 messages, 20,000
   characters per message, 400,000 total.
3. The backend attaches the pipeline bearer key and the **session user's id** as
   `ashley_user_id`, and forwards to the pipeline. The key never leaves the server, and the
   browser never sees it.
4. The pipeline pulls the character sheet out of the `CHARACTER:` message, looks the user id
   up in the `profiles` block of `config.json`, and resolves that user's preset and any
   parent overrides.
5. It composes: **guardrail → character sheet → safety floor → `SAFETY_CORE`**, in that
   order, with placeholders substituted.
6. It calls the model endpoint and returns the completion.
7. The backend passes the response body through untouched and logs the **status code only**.
   Response bodies are the child's conversation and are never written to the container log.

---

## The trust boundary

The line is `/proxy/chat`, and it is drawn in two places:

**The frontend cannot speak at the guardrail's level.** It may contribute a character sheet
and nothing else. Any attempt to smuggle in an additional `role: "system"` message is
dropped by the backend before the request leaves the process. A character sheet is data the
safety layer is composed *around*, never a peer of it.

**The wire carries an id, not prompt text.** The backend tells the pipeline *who* is
chatting; the pipeline looks up *what that user's settings are* from a file only the backend
can write. There is no code path that accepts prompt text over the network. A forged request
body can at most select an existing user's legitimate profile — it cannot inject prompt
content, because there is no field for it.

**Unknown, missing or malformed user id → the most restrictive preset.** Not the default
preset, and not "no prompt". Fail safe means fail strict, and it is logged.

There is **no code path that sends a child's message to the model without a safety prompt.**
Every failure mode of the config file — absent, unreadable, not JSON, wrong shape, blank
field — resolves to constants compiled into the pipeline itself. `SAFETY_CORE` is appended
even when everything else has fallen back.

---

## Sessions and the admin split

The session cookie is `ashley_sid`. Sessions are **server-side records** under
`/data/auth/sessions/`; the cookie carries an opaque id and nothing else.

A session record has a `kind`: `"user"` or `"admin"`. They are separate universes.

- Every route under `/api/admin/` is gated **by path**, in `before_request`, on
  `kind == "admin"`. Path-based, not per-route, so it holds for any admin route added later
  by someone who forgot to think about it.
- A user session can never satisfy an admin check. The test is on `kind`, not on presence.
- The admin username is the literal string `Admin` and is never shown; the gate asks for a
  password only.
- Failed logins are rate-limited per client key: 8 attempts per 15-minute window.

State-changing requests (`POST`/`PUT`/`PATCH`/`DELETE`) are additionally checked against the
request `Origin` when the browser sends one. `SameSite=Lax` already stops cross-site cookie
POSTs; this is belt and braces. Behind a TLS-terminating reverse proxy, Flask computes an
`http://` origin while the browser sends `https://` — which is exactly what
`ASHLEY_TRUSTED_ORIGINS` exists to reconcile. Get it wrong and every POST is refused with a
403.

---

## Content Security Policy

The backend sets, on every response:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none';
base-uri 'none'; object-src 'none'
```

There is **no `'unsafe-inline'`**, for scripts or for styles. This is load-bearing, not
decorative:

- no inline `<script>` — all JS is an external file under `/assets/`
- no `on*=` attribute handlers — every listener is attached in JS
- no inline `style="…"` attributes and no `<style>` blocks
- no CDN, no remote fonts, no remote images

A page that violates any of these renders blank or dead. CI greps for all three (see
`.github/workflows/ci.yml`). Fonts are self-hosted under `frontend/assets/fonts/`; Ashley
works with the internet unplugged.

Also set: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, a `Permissions-Policy` denying geolocation/camera/microphone/
payment, and `Cache-Control: no-store` on HTML and JSON.

---

## Data on disk

Everything persistent is under `/data` in the backend container, bind-mounted from the host.

```
/data
├── auth/                       (mode 0700, host-owned)
│   ├── users.json              the roster — one record per person
│   ├── admin.json              the parent password hash (scrypt) + its source
│   ├── ADMIN_PASSWORD.txt      first-run generated password; deleted on change
│   └── sessions/               one file per live session
├── config/
│   └── config.json             presets, per-user profiles, model settings
├── characters/                 the shared family cast, one JSON per character
├── chats/
│   └── <user_id>/              per-user chat history, one JSON per chat
└── uploads/                    character avatars
```

**`users.json`** — id (`u_` + 8 hex, immutable), display name, accent colour, saved theme,
`password_protected`, `password_hash` (werkzeug scrypt, or `null`), created-at, sort order.
The public picker payload at `GET /api/users` is a projection that **never includes hashes**.

**`admin.json`** — `password_hash`, and `source` of `"env"` or `"generated"`. If
`ASHLEY_ADMIN_PASSWORD` is set it is authoritative and re-hashed into this file on **every**
boot, which is what makes "edit `.env`, restart" a working reset path. The plaintext is never
written to a file in that case.

**`config.json`** is the one file **shared between the two containers**: the backend mounts
its directory read-write at `/data/config`, the pipeline mounts the same directory
**read-only** at `/app/config`. The backend is the only writer. Writes are atomic — temp
file in the same directory, then `os.replace` — so the pipeline can never observe a
half-written file. The pipeline re-reads it when the file's `(mtime, size, inode)` changes,
at most one `stat()` every few seconds, so a parent's save lands within seconds with no
restart.

Chats are **per user**; characters are a **shared family cast**. That is a design decision,
not an oversight: siblings write characters for each other.

---

## First boot

In order:

1. **Admin password.** `ASHLEY_ADMIN_PASSWORD` if set (re-hashed every boot) → else an
   existing `admin.json` → else generate one, write it to `ADMIN_PASSWORD.txt` (mode 0600)
   and print it to the log. `GET /api/admin/first-run` reports whether that file still
   exists so the picker can surface the password exactly once.
2. **Users.** If `users.json` is absent, create one user from `ASHLEY_DEFAULT_USER`,
   unprotected, theme `dark`.
3. **Chat migration.** Any loose `*.json` at the top level of `/data/chats/` is moved into
   that first user's directory — copy, verify, then delete, never a bare move that can
   half-fail. It is idempotent, and if anything looks wrong it leaves the files alone and
   logs loudly rather than guessing.
4. **Config.** If `config.json` is absent it is **seeded** from the environment
   (`ASHLEY_LLM_*`) and from the built-in prompt constants. It is seeded **only when
   absent** — after that the panel owns it.

That last point has a sharp edge worth knowing before you debug it: the backend seeds
`config.json` from `ASHLEY_LLM_URL` / `_MODEL` / `_API_KEY`, so the **backend** container
needs those variables even though the *pipeline* is the thing that calls the model. If the
backend is missing them it seeds empty strings, the pipeline prefers `config.json` over its
own environment, and every chat fails authentication. Both services get them in the shipped
compose file. To re-seed: move `config.json` aside and recreate the backend.

---

## Scope and limits

- **One family, one LAN.** No tenancy, no per-user isolation beyond a directory and a
  session `kind`. A parent with the admin password can read everything; that is the point.
- **One gunicorn worker.** Fine for a household, wrong for a crowd.
- **JSON on disk, no locking across processes.** Single-worker + an in-process lock is the
  whole concurrency story. Do not run two backends against one data directory.
- **Not built for internet exposure.** See [deployment.md](deployment.md).
- **The model is yours.** Ashley does not ship, download, or manage one, and its behaviour
  depends heavily on which one you point it at. A small model follows a long safety prompt
  less reliably than a large one.
