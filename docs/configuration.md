# Configuration

Ashley is configured in two places, and the split matters:

- **`.env`** — infrastructure. Endpoints, secrets, ports, cookie policy. Read at boot.
  Changing anything here means restarting the affected container.
- **`/data/config/config.json`** — everything a parent should be able to change without
  touching a file. Prompts, presets, per-user profiles, and the model settings after first
  boot. Written by the settings panel, picked up by the pipeline within seconds.

The model settings appear in both. The environment **seeds** them into `config.json` on
first boot and is the fallback if the file is unusable; after that the panel owns them.
Editing `ASHLEY_LLM_MODEL` in `.env` on a system that already has a `config.json` does
nothing until you re-seed.

---

## Environment variables

`.env` lives beside `docker-compose.yml`, is `chmod 600`, and is **never committed** —
`.gitignore` covers it. `.env.example` carries placeholders only.

### Model endpoint

| Variable | Default | Notes |
|---|---|---|
| `ASHLEY_LLM_URL` | *required* | OpenAI-compatible base URL **including `/v1`**, e.g. `http://10.0.0.10:8080/v1`. A trailing slash is stripped. |
| `ASHLEY_LLM_MODEL` | *required* | The model id exactly as the endpoint reports it in `GET /v1/models`. |
| `ASHLEY_LLM_API_KEY` | *required* | Bearer token for that endpoint. May be empty if it needs none — but see the note below. |
| `ASHLEY_LLM_TIMEOUT` | `180` | Seconds. Clamped to 1–3600. |

**Both services need these.** The pipeline uses them to call the model; the **backend** uses
them to seed `config.json`. A backend without them seeds empty strings, the pipeline prefers
`config.json` over its own environment, and every chat fails authentication while every
health check stays green. Both services carry them in the shipped compose file — keep it
that way.

An **empty** `ASHLEY_LLM_API_KEY` means "this endpoint needs no key", and Ashley sends no
`Authorization` header. It never means "authenticate with an empty string".

### Backend → pipeline

| Variable | Default | Notes |
|---|---|---|
| `ASHLEY_PIPELINE_URL` | `http://ashley-pipeline:9099/v1/chat/completions` | Service name on the internal network. |
| `ASHLEY_PIPELINE_KEY` | *required* | Shared secret. **Must not** be the Open WebUI default (`0p3n-w3bu!`). Generate: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `ASHLEY_PIPELINE_MODEL` | `ashley_pipeline` | The pipeline's own id. Rarely changed. |
| `ASHLEY_PIPELINE_TIMEOUT` | `180` | Seconds the backend waits on the pipeline. Should be ≥ `ASHLEY_LLM_TIMEOUT`. |

### Sessions and access

| Variable | Default | Notes |
|---|---|---|
| `ASHLEY_SECRET_KEY` | *required* | 32+ characters. Sessions are server-side, so rotating it does not sign everyone out — but it must exist. Generate: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ASHLEY_ADMIN_PASSWORD` | *(unset)* | The parent panel password. **When set it is authoritative** and re-hashed into `admin.json` on every boot. Leave it unset to keep whatever was last set in the app. |
| `ASHLEY_COOKIE_SECURE` | `0` | Set to `1` **only** when Ashley is served over HTTPS. On plain HTTP a `Secure` cookie is never sent and login fails silently. |
| `ASHLEY_SESSION_DAYS` | `30` | Session lifetime. |
| `ASHLEY_TRUSTED_ORIGINS` | *(empty)* | Comma-separated browser origins allowed to POST, beyond the one Flask computes. |

**`ASHLEY_TRUSTED_ORIGINS` is the one that bites behind a reverse proxy.** The proxy
terminates TLS, so Flask sees `http://` while the browser sends `https://`, the same-origin
gate refuses the mismatch, and **every POST returns 403** while GETs work fine. List the
https origin the browser actually uses:

```ini
ASHLEY_TRUSTED_ORIGINS=https://ashley.example.invalid
```

`ASHLEY_AUTH_REQUIRED` is **retired**. Login is per-user now: each record in `users.json`
carries its own `password_protected` flag, managed in the panel. If you find it in an old
`.env`, delete the line.

### First boot and limits

| Variable | Default | Notes |
|---|---|---|
| `ASHLEY_DEFAULT_USER` | *(built-in)* | Display name for the single account created on **first boot only**, when `users.json` does not exist. Changing it later does nothing — rename in the panel. |
| `ASHLEY_DEFAULT_PRESET` | `child_8_12_restrictive` | Which preset that account starts on. Must be one of the four ids in [presets.md](presets.md); an unrecognised value logs a warning and falls back. |
| `ASHLEY_MAX_UPLOAD_MB` | `8` | Avatar upload cap. Requests over it get a `413`. |
| `ASHLEY_ADMIN_USER` | `ashley` | Legacy; the admin identity is the literal string `Admin` and is never shown. |

### Paths

| Variable | Default | Notes |
|---|---|---|
| `ASHLEY_DATA_DIR` | `./data` | **Host** path holding everything persistent. Read by `docker-compose.yml`, not by the app — it is what every bind mount is relative to. |
| `ASHLEY_DATA_ROOT` | `/data` | Inside the backend container. Rarely changed. |
| `ASHLEY_STATIC_ROOT` | `/app/static` | The frontend, mounted read-only. |
| `ASHLEY_CONFIG_PATH` | `/app/config/config.json` | **Pipeline side.** Where it reads the shared config. |
| `ASHLEY_CONFIG_STAT_INTERVAL` | `3.0` | Seconds between `stat()` calls on that file. |

---

## `config.json`

Lives at `/data/config/config.json` (mode 0600). The backend is the **only writer**; the
pipeline mounts the same directory read-only. Writes are atomic — temp file in the same
directory, then `os.replace` — so a reader never sees a half-written file.

```json
{
  "version": 1,
  "prompts": {
    "guardrail_system": "…",
    "safety_floor": "…"
  },
  "presets": {
    "child_8_12_restrictive": {
      "id": "child_8_12_restrictive",
      "label": "Child (8–12) · Gentle",
      "age_band": "8-12",
      "latitude": "restrictive",
      "description": "…",
      "guardrail_system": "…",
      "safety_floor": "…"
    }
  },
  "default_preset": "child_8_12_restrictive",
  "profiles": {
    "u_8f3a1c2b": {
      "display_name": "Alex",
      "preset": "teen_13_16_unhinged",
      "guardrail_system": null,
      "safety_floor": null
    }
  },
  "model": {
    "url": "http://10.0.0.10:8080/v1",
    "model": "YOUR_MODEL_ID",
    "api_key": "…",
    "timeout": 180
  },
  "appearance": { "default_theme": "dark" },
  "updated_at": 1785900000
}
```

| Block | Owned by | Notes |
|---|---|---|
| `prompts` | panel | Legacy global pair; still honoured as a fallback. |
| `presets` | source constants | Restored verbatim by `POST /api/admin/config/reset-prompts`. |
| `default_preset` | panel | Applied to newly created users. |
| `profiles` | backend | Written on user create / rename / settings change. Keyed by user id. `null` override = use the preset. |
| `model` | panel (seeded from env) | See below. |
| `appearance.default_theme` | panel | Theme the picker page uses before anyone signs in. |

`SAFETY_CORE` is **not** in this file. It is a constant in both `backend/server.py` and
`pipeline/ashley_pipeline.py`, appended last, and has no write path. That is the design —
see [safety-model.md](safety-model.md).

### The model block and the redaction sentinel

`GET /api/admin/config` returns `model.api_key` as `••••` when one is set, plus a boolean
`model.api_key_set`. The real key is never sent to a browser.

On `PUT`, if `api_key` is absent **or** equal to that sentinel, the stored key is kept. This
is what lets the panel round-trip the config without a parent having to retype the key on
every save. The pipeline independently treats the sentinel, an empty string, and a
non-string as "nothing configured here" and falls back to `ASHLEY_LLM_API_KEY`.

### Validation

- The safety floor may not be empty or whitespace: `400 {"error":"the safety floor cannot be empty"}`.
- Prompt fields are capped at 40,000 characters.
- `timeout` must be 1–3600; anything else falls back to the environment value.
- The pipeline validates every field independently and logs which rung it landed on:
  `config` (panel in control), `mixed` (one field fell back), or `builtin` (both did).

---

## Themes

Five, in this order: `dark` (Midnight), `ivory`, `blood`, `blue`, `forest`.

A theme is a block of CSS custom-property overrides on `:root[data-theme="…"]` and nothing
else — no component rule anywhere carries a raw colour. The theme is applied **before first
paint** by a small external script in `<head>`, so there is no flash of the wrong theme. It
persists to `localStorage` immediately and to the server via `POST /api/theme` for signed-in
users. The picker page uses `appearance.default_theme`.

---

## Reset paths

**Parent panel password.** Set `ASHLEY_ADMIN_PASSWORD` in `.env` and restart the backend:

```bash
docker compose up -d ashley-backend
```

It is re-hashed into `admin.json` on every boot, so that is the whole procedure. The
plaintext is never written to a file when it comes from the environment.

**Lost password with no `ASHLEY_ADMIN_PASSWORD` set.** Set one and restart, as above. Or
delete `auth/admin.json` and restart with the variable unset — a new password is generated,
printed to the log, and written to `auth/ADMIN_PASSWORD.txt` (mode 0600). That file is
deleted the moment the password is changed in the app.

**Re-seed the model settings from `.env`.** The backend seeds `config.json` **only when the
file is absent**:

```bash
docker compose stop ashley-backend
mv /srv/ashley/config/config.json /srv/ashley/config/config.json.bak
docker compose up -d --force-recreate ashley-backend
```

This discards presets and per-user profiles along with the model block. Keep the backup.

**Restore the shipped prompt templates.** Use the panel's restore-defaults control, or
`POST /api/admin/config/reset-prompts`. This does not touch per-user overrides; use each
user's Reset for those.

---

## Verifying it actually works

The panel's model test does `GET {url}/models` with the bearer key. That proves the endpoint
is reachable and the URL is right. **It does not prove a chat will work** — some servers,
`llama-server` among them, serve `/v1/models` without authentication and then reject an
unauthenticated `POST /v1/chat/completions`. A green connectivity probe alongside a 401 on
every message is a real and confusing failure.

**Send one real message as a real user before you hand it to anyone.** That is the only
check that exercises the whole path.

If replies are slow, test the endpoint directly, bypassing Ashley, before you go looking for
a regression here — a single-GPU inference server queues requests serially, and a queue of
concurrent test messages will make a healthy stack look broken.
