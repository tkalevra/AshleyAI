# Deployment

Ashley is a two-container Docker Compose stack for a **family LAN**. This page covers
standing it up, where the data goes, putting it behind a reverse proxy, backups, upgrades,
and the reasons not to expose it to the internet.

---

## What you need

- A host that runs Docker with Compose v2 — a NAS, a small server, a spare box. It does not
  need a GPU; it does not run the model.
- An OpenAI-compatible chat endpoint the host can reach: llama.cpp's `llama-server`, Ollama,
  LM Studio, vLLM, or similar. This is where the GPU (if any) lives.
- Somewhere to put a few hundred megabytes of JSON and avatars.

---

## Standing it up — the installer

```bash
git clone https://github.com/tkalevra/AshleyAI.git
cd AshleyAI
./install.sh          # install.bat on Windows
```

Seven questions: model endpoint (it probes `/v1/models` and offers what it finds), where the
data goes, the address you will reach it at, the parent password, and the first account with
its preset. It then writes `.env` with generated secrets at mode 0600, creates the data
directories with the right ownership and modes, copies the pipeline file into place, builds,
starts, and polls `/healthz`.

An existing `.env` is **backed up, not overwritten**, and its values are offered as defaults —
so re-running it is a reasonable way to change a setting. `ASHLEY_SECRET_KEY` and
`ASHLEY_PIPELINE_KEY` are preserved across runs on purpose; regenerating the session key would
sign everyone out.

It does not run as root. If it cannot `chown` the data directories to `950:950` it says so and
prints the command to run.

## Standing it up — by hand

```bash
cp .env.example .env
chmod 600 .env
```

Fill in `.env` — every variable is documented in [configuration.md](configuration.md). The
required ones are `ASHLEY_LLM_URL`, `ASHLEY_LLM_MODEL`, `ASHLEY_LLM_API_KEY`,
`ASHLEY_PIPELINE_KEY`, `ASHLEY_SECRET_KEY`, and `ASHLEY_DATA_DIR`.

`ASHLEY_DATA_DIR` is the one the compose file reads: every bind mount below is relative to
it, and it defaults to `./data` beside the checkout. Create those directories on the host and
give them to the uid the container runs as:

```bash
sudo mkdir -p /srv/ashley/{characters,chats,uploads,auth,config,pipeline}
sudo chown -R 950:950 /srv/ashley
sudo chmod 700 /srv/ashley/auth /srv/ashley/config
```

Put the pipeline file where the pipeline container will find it:

```bash
sudo cp pipeline/ashley_pipeline.py /srv/ashley/pipeline/
sudo chown 950:950 /srv/ashley/pipeline/ashley_pipeline.py
```

Then:

```bash
docker compose build ashley-backend
docker compose up -d ashley-pipeline ashley-backend
docker compose logs -f ashley-backend
```

The log will tell you the admin password if one was generated. Open
`http://<host>:8181/`, sign in as the single first-boot user, then go to `/admin`.

Then **send one real message**. A green health check and a green model probe are not proof
the path works end to end — see [configuration.md](configuration.md#verifying-it-actually-works).

---

## Containers and ports

| Service | Image | Published | Reachable from |
|---|---|---|---|
| `ashley-backend` | built from `backend/Dockerfile` | `8181:5000` | the LAN |
| `ashley-pipeline` | `ghcr.io/open-webui/pipelines:main` | `127.0.0.1:9098:9099` | **the backend only** |

The pipeline's published port is bound to **loopback**, for host-local debugging. The backend
reaches it by service name over the internal bridge network.

**Do not publish the pipeline to the LAN.** Anything that can reach it directly bypasses the
backend's message filtering — the layer that stops a client sending its own `system` message
alongside the safety prompt. Loopback binding is part of the safety model, not a tidiness
preference.

The backend runs as **uid/gid 950:950**, non-root, with `no-new-privileges` and all
capabilities dropped. Pick whatever uid owns your data directories and keep the two in sync;
a mismatch shows up as permission errors on first write, not at start-up.

---

## Volumes

All host paths are relative to `$ASHLEY_DATA_DIR` (default `./data`, `/srv/ashley` in the
examples on this page).

| Host path | Container | Mode | Holds |
|---|---|---|---|
| `$ASHLEY_DATA_DIR/characters` | `/data/characters` | rw | the shared family cast |
| `$ASHLEY_DATA_DIR/chats` | `/data/chats` | rw | per-user chat history |
| `$ASHLEY_DATA_DIR/uploads` | `/data/uploads` | rw | character avatars |
| `$ASHLEY_DATA_DIR/auth` | `/data/auth` | rw | account roster, password hashes, sessions |
| `$ASHLEY_DATA_DIR/config` | `/data/config` | rw | `config.json` — backend is the writer |
| `$ASHLEY_DATA_DIR/config` | `/app/config` | **ro** | the same directory, on the pipeline |
| `$ASHLEY_DATA_DIR/pipeline` | `/app/pipelines` | rw | `ashley_pipeline.py` |
| `./frontend` | `/app/static` | **ro** | the frontend, served as-is |

The config directory is mounted into **both** containers — read-write on the backend,
**read-only** on the pipeline. That asymmetry is deliberate: one writer, one reader, atomic
replaces, no locking.

There is no `VOLUME` declaration in the Dockerfile. That is on purpose — it would mask the
bind mounts' ownership handling and create an anonymous volume on every rebuild.

Keep `auth/` and `config/` at mode `700`. `auth/` holds password hashes and live sessions.

---

## Behind a reverse proxy

Optional, and only worth it for a hostname and TLS on your own network. If you do:

1. **Set `ASHLEY_TRUSTED_ORIGINS`** to the https origin the browser uses. The proxy
   terminates TLS, so Flask sees `http://` while the browser sends `https://`, the
   same-origin gate refuses the mismatch, and **every POST returns 403** while GETs work
   fine. This is the single most common deployment failure.

   ```ini
   ASHLEY_TRUSTED_ORIGINS=https://ashley.example.invalid
   ```

2. **Set `ASHLEY_COOKIE_SECURE=1`** once you are genuinely on https. Do it before you are and
   nobody can log in, silently — a `Secure` cookie is never sent over plain HTTP.

3. **Raise the proxy's read timeout past Ashley's.** A local model can take a while, and
   proxies default low — nginx is 60s, many managers ship 90s. Ashley's own cap is 180s by
   default and gunicorn's is 300s, so a proxy at 90s turns a slow-but-successful reply into
   a `504` and hides the readable error the backend would have returned. Set 300s.

4. **Do not put it on a public DNS record.** See below.

Ashley sets `frame-ancestors 'none'` and `X-Frame-Options: DENY`; do not try to embed it.

---

## Do not expose this to the internet

Ashley is built for a LAN and it is honest about that.

- **One password protects everything a parent can change.** There is no MFA, no lockout
  beyond a per-client rate limit, no audit log.
- **No tenancy.** Every user is a directory and a session `kind`. It is a household, not a
  service.
- **One gunicorn worker.** It is not built to absorb traffic, hostile or otherwise.
- **The conversations are a child's.** The blast radius of getting this wrong is not
  "someone reads my notes".

If you need it from outside the house, use a VPN or an overlay network — WireGuard,
Tailscale, whatever you already run — and keep Ashley on the private side of it. Do not
create a public DNS record for it, and do not port-forward to it.

If you disregard this: at minimum put a real identity-aware proxy in front, enable
`ASHLEY_COOKIE_SECURE`, use a long unique admin password, and understand that you are
outside what the design accounts for.

---

## Backups

Everything that matters is JSON on disk. Stop the backend, copy the tree, start it again:

```bash
docker compose stop ashley-backend
sudo tar czf ashley-backup-$(date +%F).tar.gz -C /srv ashley
docker compose start ashley-backend
```

You can copy it hot — writes are atomic — but stopping first removes the question.

Back up `.env` too, **separately and privately**. It holds every secret and it is
deliberately not in the repository. Without `ASHLEY_SECRET_KEY` and `ASHLEY_PIPELINE_KEY` a
restore is not a restore.

Restoring is the reverse: put the tree back, `chown -R 950:950`, `docker compose up -d`.

`auth/` contains password hashes and live sessions. Treat the backup accordingly.

---

## Upgrading

```bash
git pull
sudo cp pipeline/ashley_pipeline.py /srv/ashley/pipeline/
docker compose build ashley-backend
docker compose up -d
```

Re-running `./install.sh` does the same thing and takes Enter through every prompt, since it
offers your existing `.env` values as defaults and backs the file up before writing.

Two things to remember:

- **The pipeline file is copied, not built.** It is mounted from the host, so rebuilding the
  backend image does not update it. Forgetting this leaves you running the old prompt logic
  against the new backend — and since nothing errors, it can go unnoticed for a while.
- **Rebuilding the backend does not restart the pipeline.** If a change touches both, use
  `docker compose up -d --force-recreate ashley-pipeline` as well.

The frontend is a read-only bind mount of `./frontend`, so it updates with `git pull` and a
browser refresh. The static assets are cache-busted with a query string; a hard refresh
settles anything stale.

`config.json` is never overwritten by an upgrade — it is only seeded when absent. New preset
fields added by a release will not appear in an existing file; the restore-defaults control
in the panel is what pulls them in.

---

## Health and logs

`GET /healthz` on the backend returns 200 when the process is up. The container has a
`HEALTHCHECK` that hits it every 30s.

```bash
docker compose logs -f ashley-backend
docker compose logs -f ashley-pipeline
```

What you will see, and what you will not:

- **Backend:** request lines, the pipeline's HTTP **status code**, and bootstrap decisions.
- **Pipeline:** at start-up, which prompt source is live — `config` (the panel is in
  control), `mixed` (one field fell back), or `builtin` (both did). `builtin` in steady state
  means the panel is **not** controlling the safety text; find out why.

**Conversation content is never logged.** Not the messages, not the completions, not the
error bodies that might echo them. That is a hard rule in the code, and it means the logs
cannot help you debug what a character actually said — read the chat JSON on disk for that,
which is a deliberate act by a person with access.

If the model server errors, the child sees a bracketed `[Ashley: …]` message in the chat
rather than a silent failure. That is intentional: a stuck spinner reads as "it's ignoring
me".
