<div align="center">

<img src="assets/ashley-mark.svg" alt="Ashley" width="72">

# Ashley

**A protective pathway for parents whose kids want AI.**

[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue)](LICENSE)
[![brought to you by Volenti](https://img.shields.io/badge/brought_to_you_by-Volenti-ff8a5b)](https://volenti.ca)

</div>

---

A self-hosted character-chat app for children and teens, where the **child owns the
characters** and a **parent owns the safety layer**.

A child writes a character — a name, a personality, a backstory — and talks to it. A parent
signs into a separate settings panel and decides, per child, how much latitude that
character gets: vocabulary, tone, subject matter, how an 8-year-old is spoken to versus a
15-year-old. The safety prompt is composed on the server, in a container the browser cannot
reach, and the frontend has no way to send prompt text of its own.

It runs entirely on hardware you own, against a local model — llama.cpp's `llama-server`,
Ollama, LM Studio, or anything else that speaks the OpenAI chat-completions API. Nothing
leaves the network. There is no account, no telemetry, no vendor, and no third party who
gets to read a child's conversations.

An open-source project published under **Volenti**.
Licensed **AGPL-3.0-or-later**.

---

## Who this is for

Parents who are already going to be asked for a character-chat app, and would rather run one
they can see inside than hand a child to a service that logs everything. It assumes you can
run Docker Compose and point at a model endpoint. It does not assume you want to read Python
to change what the AI is allowed to say — that is what the settings panel is for.

It is deliberately a **family LAN application**. It is not multi-tenant, not hardened for
the public internet, and not built to be exposed to one. See [Deployment](docs/deployment.md).

---

## The safety model, briefly

Every message sent to the model carries a system prompt assembled server-side from three
layers, in this order:

1. **The preset** (or a parent's override of it) — tone, latitude, and age-appropriate
   framing. Chosen per child from four templates: Child 8–12 and Teen 13–16, each in a
   protective and a relaxed variant.
2. **The character sheet** — the only thing the child's browser contributes.
3. **`SAFETY_CORE`** — a constant compiled into both the backend and the pipeline, appended
   **last**, for every preset and every user. It is not editable from the settings panel.
   It carries the non-negotiables: nothing sexual, no real instructions for genuinely
   dangerous things, nothing that demeans a real person, no physical intimidation, and the
   secrecy rule — never agree to keep secrets from a parent, never position yourself as the
   child's only confidant, never offer yourself as the alternative to telling a trusted adult.

The core goes last because recency wins: when the safety text came first, the character
sheet out-pulled it in practice.

**Be clear about what this is.** This is prompt-level safety over a language model. It
reduces risk; it does not eliminate it. A determined teenager can jailbreak any prompt-level
control, including this one. Ashley is not a substitute for a parent paying attention — it
is a way to make the default behaviour reasonable and to make the settings visible. The full
honest account, including the failure modes, is in [docs/safety-model.md](docs/safety-model.md).
Read it before you decide this is enough for your family.

---

## What it does

- **A user picker at the front door.** OS-style tiles, one per person, keyboard navigable.
  It never auto-enters the app — on a shared tablet the first question is who you are.
- **Optional per-user passwords.** Each user carries their own `password_protected` flag.
  A young child can tap straight in; an older one can have a password. There is no global
  login switch.
- **A parent settings panel** at `/admin`, behind its own password, on its own session kind.
  A signed-in user session can never satisfy an admin check.
- **Per-user safety presets** by age band and latitude, individually overridable, with the
  immutable core shown read-only so a parent can see exactly what is always applied.
- **Characters the child writes** — a shared family cast, with avatar uploads.
- **Per-user chat history**, stored as plain JSON on your disk. You can read it, back it up,
  and delete it with `rm`.
- **Five themes** — Midnight, Ivory, Blood, Deep Blue, Forest — applied before first paint,
  saved per user.
- **Local everything.** Self-hosted fonts, no CDN, no remote assets. A strict
  `script-src 'self'` CSP with no `unsafe-inline` anywhere.

---

## Architecture

Three moving parts, one Docker network:

```
browser ──▶ ashley-backend (Flask/gunicorn)  ──▶ ashley-pipeline  ──▶ your LLM endpoint
            auth · users · admin API              composes the        (llama.cpp, Ollama,
            static frontend · chat proxy          system prompt        LM Studio, …)
```

The backend serves the frontend, owns sessions and the admin API, and proxies chat. The
**pipeline** — an Open WebUI `pipelines` container running a single Python file — is where
the safety prompt is composed. It is not published to the LAN; only the backend can reach it.

The trust boundary is the backend's `/proxy/chat`: it strips every `system` message except a
single leading one beginning `CHARACTER:`, so the browser can supply a character sheet and
nothing else. The body the backend sends the pipeline carries a **user id**, never prompt
text — a forged body can at most select an existing user's legitimate profile.

Details: [docs/architecture.md](docs/architecture.md).

---

## Quick start

You need Docker with Compose v2, Python 3.9+, and an OpenAI-compatible chat endpoint you can
reach.

```bash
git clone https://github.com/tkalevra/AshleyAI.git
cd AshleyAI
./install.sh          # install.bat on Windows
```

The installer asks seven questions — model endpoint, where the data goes, the address you
will reach it at, the parent password, the first account and its preset — writes `.env` with
generated secrets, creates and permissions the data directories, installs the pipeline file,
then builds and starts the stack and waits for it to answer. It backs up an existing `.env`
rather than overwriting it, so it is safe to re-run to change a setting.

<details>
<summary>Or set it up by hand</summary>

```bash
cp .env.example .env
chmod 600 .env
```

Edit `.env`. At minimum:

```ini
ASHLEY_LLM_URL=http://10.0.0.10:8080/v1
ASHLEY_LLM_MODEL=YOUR_MODEL_ID
ASHLEY_LLM_API_KEY=your-endpoint-key-or-blank

ASHLEY_DATA_DIR=/srv/ashley
ASHLEY_PIPELINE_KEY=<python3 -c "import secrets; print(secrets.token_urlsafe(32))">
ASHLEY_SECRET_KEY=<python3 -c "import secrets; print(secrets.token_urlsafe(48))">
ASHLEY_ADMIN_PASSWORD=<a password the parents will remember>
```

Then create the directories, install the pipeline file, and start it:

```bash
sudo mkdir -p /srv/ashley/{characters,chats,uploads,auth,config,pipeline}
sudo chown -R 950:950 /srv/ashley
sudo chmod 700 /srv/ashley/auth /srv/ashley/config
sudo cp pipeline/ashley_pipeline.py /srv/ashley/pipeline/

docker compose build ashley-backend
docker compose up -d ashley-pipeline ashley-backend
```

</details>

Open `http://<your-host>:8181/`. You will get one account tile; sign in, then visit `/admin`
with the parent password to add the rest of the family and set each one's preset.

If you left `ASHLEY_ADMIN_PASSWORD` blank, a password is generated on first boot, printed to
the container log, and written once to `auth/ADMIN_PASSWORD.txt`. It is deleted the moment
you change the password in the app.

**Verify it end to end before you hand it to anyone.** A settings-panel "test model" probe
proves connectivity, not that a chat will work — some endpoints serve `GET /v1/models`
without authentication and then reject an unauthenticated `POST /v1/chat/completions`. Send
one real message.

---

## Configuration

Full reference: [docs/configuration.md](docs/configuration.md). The short version:

| Variable | Default | What it does |
|---|---|---|
| `ASHLEY_LLM_URL` | *(required)* | OpenAI-compatible base URL, including `/v1`. |
| `ASHLEY_LLM_MODEL` | *(required)* | Model id as the endpoint reports it. |
| `ASHLEY_LLM_API_KEY` | *(required)* | Bearer key for that endpoint. May be empty if it needs none. |
| `ASHLEY_LLM_TIMEOUT` | `180` | Seconds to wait for a completion. |
| `ASHLEY_PIPELINE_KEY` | *(required)* | Shared secret, backend → pipeline. Never the Open WebUI default. |
| `ASHLEY_SECRET_KEY` | *(required)* | Session signing key, 32+ chars. Keep it stable across restarts. |
| `ASHLEY_DATA_DIR` | `./data` | Where everything persistent lives on the host. |
| `ASHLEY_ADMIN_PASSWORD` | *(unset)* | Parent panel password. When set it is authoritative and re-applied every boot — editing `.env` and restarting **is** the reset path. |
| `ASHLEY_DEFAULT_USER` | *(built-in)* | Display name of the single account created on first boot **only**. Changing it later does nothing — rename in the panel. |
| `ASHLEY_DEFAULT_PRESET` | `child_8_12_restrictive` | Safety preset that account starts on. |
| `ASHLEY_TRUSTED_ORIGINS` | *(empty)* | Extra browser origins allowed to POST. Required behind a TLS-terminating proxy. |
| `ASHLEY_COOKIE_SECURE` | `0` | Set to `1` only when served over HTTPS. |
| `ASHLEY_SESSION_DAYS` | `30` | Session lifetime. |
| `ASHLEY_MAX_UPLOAD_MB` | `8` | Avatar upload cap. |

The LLM endpoint, model, key and timeout are only *seeded* from the environment on first
boot. After that the settings panel owns them, in `/data/config/config.json`.

---

## Documentation

| | |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Request path, containers, what is on disk, the trust boundary. |
| [docs/safety-model.md](docs/safety-model.md) | The three layers, why the core is not editable, and what this does not protect against. |
| [docs/presets.md](docs/presets.md) | The four presets — what each permits and refuses, and how to override one. |
| [docs/configuration.md](docs/configuration.md) | Every environment variable and every field of `config.json`. |
| [docs/deployment.md](docs/deployment.md) | Volumes, ownership, reverse proxy, backup, upgrade, reset paths. |
| [CONTRIBUTING.md](CONTRIBUTING.md) | House rules — the platform constraints a patch has to respect. |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability or a safety bypass. **Not** a public issue. |

---

## Status

Ashley runs in a household. It is published because it was worth writing down, not because
it is a product with a support contract. There is no roadmap you can hold anyone to, and
issues get answered when they get answered. If that is not the arrangement you want, do not
put a child on it.

Known limitations are stated where they belong rather than collected here: prompt-level
safety in [docs/safety-model.md](docs/safety-model.md), single-worker/LAN-scope in
[docs/architecture.md](docs/architecture.md), exposure in [docs/deployment.md](docs/deployment.md).

---

## Licence

Copyright (C) 2026, held by the author.

Ashley AI is free software: you can redistribute it and/or modify it under the terms of the
**GNU Affero General Public License, version 3 or later**, as published by the Free Software
Foundation. It is distributed in the hope that it will be useful, but **without any
warranty**; without even the implied warranty of merchantability or fitness for a particular
purpose. See the [LICENSE](LICENSE) file for the full text.

The AGPL's network clause is deliberate: if you run a modified Ashley as a service that other
people use over a network, they are entitled to your modified source.

Fonts (Syne, Space Grotesk) are bundled under the SIL Open Font License 1.1 — see
`frontend/assets/fonts/OFL.txt`. The pipeline runs inside the Open WebUI `pipelines`
container image, which is licensed separately by its authors.

**Copyright is held personally by the author. Volenti is the outfit it is
published under — a brand association, not an assignment of ownership.** Do not attribute
copyright in this project to Volenti.
