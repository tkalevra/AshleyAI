# Security policy

Ashley is used by children. Please report problems privately.

---

## Do not open a public issue

This applies to **both** of the following, and the second one is the reason this file leads
with it:

**Vulnerabilities** — authentication bypass, session handling, path traversal, anything that
lets one user reach another's data, anything that lets a client reach the pipeline directly,
anything that exposes a key or a hash.

**Safety bypasses** — a phrasing, a character-sheet construction, or a conversational
sequence that reliably gets a model past `SAFETY_CORE`. A working bypass published in a
public tracker, alongside a link to the app it works on, is a recipe with an audience. It
does not matter that the underlying weakness is a general property of language models; the
specific, reproducible sequence is the harmful part, and it does not need to be indexed.

If you have already opened one, delete it and report privately instead. Nobody will be
annoyed with you for the mistake.

---

## How to report

Use **GitHub's private vulnerability reporting** on the repository:

> **Security** → **Report a vulnerability** — <https://github.com/tkalevra/AshleyAI/security/advisories/new>

That opens a private thread visible only to the maintainer. It is the preferred channel for
everything on this page.

If private reporting is unavailable to you, open a public issue that says only *"I would like
a private channel to report a security matter"* — **no details, no reproduction, no prompt
text** — and wait to be contacted.

### What to include

- What you did, in enough detail to reproduce it.
- What you expected, and what happened instead.
- For a safety bypass: the model and endpoint you used, the preset in effect, and whether it
  reproduces across restarts or was a one-off. Whether a bypass is reliable matters more than
  whether it happened once.
- The commit or release you were on.
- Anything you already know about the cause.

You do not need a proof-of-concept exploit. A clear description is enough.

---

## What to expect

This is a spare-time project maintained by one person. Being straight about that is more
useful than a service-level agreement nobody is contractually bound to:

- **Acknowledgement:** as soon as it is seen — realistically within a week.
- **Assessment:** a plain answer on whether it is a real problem and how serious.
- **Fix:** as fast as the severity warrants. Something that exposes a child's conversations
  or defeats the secrecy rule gets dealt with immediately. A hardening improvement gets dealt
  with when there is time.
- **Credit:** you will be credited in the fix and in [AUTHORS](AUTHORS) unless you would
  rather not be. Say which.

If you do not hear back in two weeks, a nudge is welcome and not an imposition.

---

## Scope

**In scope** — anything in this repository: the Flask backend, the pipeline, the frontend,
the Docker Compose setup, the shipped prompt text and presets, the documentation where it
tells you to do something unsafe.

**Out of scope**, though a note is still appreciated:

- **That prompt-level safety can be jailbroken in general.** This is documented, known, and
  stated plainly in [docs/safety-model.md](docs/safety-model.md). A *specific, reliable*
  sequence against the shipped `SAFETY_CORE` is in scope and privately reportable; "LLM
  guardrails are defeatable" is a fact about language models, not a finding about Ashley.
- **Vulnerabilities in the model you point Ashley at.** Report those to whoever wrote it.
- **The Open WebUI `pipelines` base image.** Report upstream; tell us if it affects Ashley.
- **Exposure caused by publishing Ashley to the internet.** It is documented as a LAN
  application and [deployment.md](docs/deployment.md) says not to. Design weaknesses that
  matter *even on a LAN* are in scope.
- **Anyone with the admin password or host shell access being able to change everything.**
  That is the design. A parent is meant to have full control of their own installation.
- **Missing rate limits or hardening on the model endpoint.** Ashley does not own it.

---

## Supported versions

The current `master` branch. There are no maintained release branches and no backports.
Update before reporting if you can.

---

## For people running Ashley

The practical things that protect an installation, in order of how often they go wrong:

1. **Keep it off the public internet.** Use a VPN or overlay network if you need it from
   outside. No public DNS record, no port forward.
2. **Set a real `ASHLEY_ADMIN_PASSWORD`** and do not reuse it from somewhere else.
3. **Generate `ASHLEY_PIPELINE_KEY` and `ASHLEY_SECRET_KEY` randomly.** The pipeline key must
   never be the Open WebUI default.
4. **Keep the pipeline on loopback.** Publishing it to the LAN bypasses the backend's message
   filtering — the layer that stops a client sending its own system prompt.
5. **`chmod 600 .env`, `chmod 700 auth/ config/`.** They hold hashes, sessions and keys.
6. **Set `ASHLEY_COOKIE_SECURE=1` only once you are genuinely on HTTPS**, and set
   `ASHLEY_TRUSTED_ORIGINS` when behind a TLS-terminating proxy.
7. **Back up `.env` separately and privately.** It is not in the repository, by design.
