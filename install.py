#!/usr/bin/env python3
"""
Ashley AI guided installer.

Walks through everything needed to get a working instance: prerequisites, where
the data lives, which model to talk to, the parent's admin password, and the
first child account. Writes .env, creates the data directories, and can build
and start the stack for you.

Safe to re-run. It reads any existing .env and offers those values as defaults,
so it doubles as a reconfigure tool. Nothing is written until you confirm.

Copyright (C) 2026 Christopher Thompson
Licensed under the GNU Affero General Public License v3.0 or later.
"""

from __future__ import annotations

import json
import os
import platform
import re
import secrets
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"

# ── tiny cross-platform colour (auto-off on dumb terminals) ────────────────────
_USE_COLOR = (
    sys.stdout.isatty()
    and os.environ.get("TERM") != "dumb"
    and (
        platform.system() != "Windows"
        or os.environ.get("WT_SESSION")
        or os.environ.get("ANSICON")
    )
)


def _c(code: str, s: str) -> str:
    return f"\033[{code}m{s}\033[0m" if _USE_COLOR else s


def bold(s):   return _c("1", s)
def green(s):  return _c("32", s)
def yellow(s): return _c("33", s)
def red(s):    return _c("31", s)
def cyan(s):   return _c("36", s)
def dim(s):    return _c("2", s)


def hr() -> None:
    print(dim("─" * 68))


def heading(step: str, title: str) -> None:
    print()
    hr()
    print(f"  {cyan(step)}  {bold(title)}")
    hr()


def ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    try:
        got = input(f"{prompt}{suffix}: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\nCancelled. Nothing was written.")
        sys.exit(1)
    return got or default


def ask_secret(prompt: str, default: str = "") -> str:
    """Read without echoing. Falls back to a visible prompt where getpass can't."""
    import getpass

    suffix = " [keep current]" if default else ""
    try:
        got = getpass.getpass(f"{prompt}{suffix}: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\nCancelled. Nothing was written.")
        sys.exit(1)
    except Exception:
        got = ask(prompt, "")
    return got or default


def ask_yes(prompt: str, default_yes: bool = True) -> bool:
    hint = "Y/n" if default_yes else "y/N"
    got = ask(f"{prompt} ({hint})").lower()
    if not got:
        return default_yes
    return got.startswith("y")


def choose(prompt: str, options: list[tuple[str, str]], default_index: int = 0) -> str:
    """options = [(value, description)]. Returns the chosen value."""
    print(f"\n{prompt}")
    for i, (value, desc) in enumerate(options, 1):
        marker = green("→") if i - 1 == default_index else " "
        print(f"  {marker} {bold(str(i))}. {value}")
        if desc:
            for line in _wrap(desc, 62):
                print(f"       {dim(line)}")
    while True:
        got = ask("Choice", str(default_index + 1))
        if got.isdigit() and 1 <= int(got) <= len(options):
            return options[int(got) - 1][0]
        print(red("  Pick one of the numbers listed."))


def _wrap(text: str, width: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return lines


# ── prerequisites ─────────────────────────────────────────────────────────────

def check_prereqs() -> bool:
    heading("1/7", "Checking prerequisites")
    ok = True

    docker = shutil.which("docker")
    if docker:
        print(f"  {green('✓')} docker             {dim(docker)}")
    else:
        print(f"  {red('✗')} docker             not found — install Docker Engine or Docker Desktop")
        ok = False

    if docker:
        probe = subprocess.run(
            ["docker", "compose", "version"],
            capture_output=True, text=True,
        )
        if probe.returncode == 0:
            print(f"  {green('✓')} docker compose     {dim(probe.stdout.strip().splitlines()[0])}")
        else:
            print(f"  {red('✗')} docker compose     not available (need Compose v2)")
            ok = False

        daemon = subprocess.run(["docker", "info"], capture_output=True, text=True)
        if daemon.returncode == 0:
            print(f"  {green('✓')} docker daemon      running")
        else:
            print(f"  {yellow('!')} docker daemon      not reachable — start Docker before the last step")

    if not ok:
        print()
        print(red("  Install the missing pieces and re-run this installer."))
    return ok


# ── model endpoint ────────────────────────────────────────────────────────────

def _http_get(url: str, headers: dict | None = None, timeout: int = 8) -> bytes:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def probe_models(base_url: str, api_key: str) -> list[str]:
    """Ask an OpenAI-compatible endpoint what it serves. [] on any failure."""
    base = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    for path in ("/models", "/v1/models"):
        candidate = base + path if not base.endswith("/v1") or path == "/models" else base + path
        try:
            raw = _http_get(candidate, headers)
        except Exception:
            continue
        try:
            data = json.loads(raw)
        except Exception:
            continue
        items = data.get("data") or data.get("models") or []
        names = []
        for it in items:
            if isinstance(it, str):
                names.append(it)
            elif isinstance(it, dict):
                name = it.get("id") or it.get("model") or it.get("name")
                if name:
                    names.append(name)
        if names:
            return names
    return []


def configure_model(existing: dict) -> dict:
    heading("2/7", "Connecting to your language model")
    print("  Ashley talks to any OpenAI-compatible endpoint — llama.cpp's llama-server,")
    print("  Ollama, LM Studio, vLLM, or anything else that speaks that API.")
    print(f"  {dim('It runs on your hardware. No conversation leaves your network.')}")

    url = ask(
        "\n  Endpoint base URL",
        existing.get("ASHLEY_LLM_URL", "http://localhost:8080/v1"),
    )
    key = ask_secret("  API key (blank if your endpoint needs none)",
                     existing.get("ASHLEY_LLM_API_KEY", ""))

    print(f"\n  {dim('Probing ' + url + ' ...')}")
    models = probe_models(url, key)

    if models:
        print(f"  {green('✓')} reachable — {len(models)} model(s) available")
        opts = [(m, "") for m in models[:12]]
        default_idx = 0
        prev = existing.get("ASHLEY_LLM_MODEL", "")
        if prev in models:
            default_idx = models.index(prev)
        if len(models) == 1:
            model = models[0]
            print(f"  Using {bold(model)}")
        else:
            model = choose("  Which model should Ashley use?", opts, default_idx)
    else:
        print(f"  {yellow('!')} could not reach that endpoint, or it listed no models.")
        print(f"    {dim('That is fine — you can fix it later in the admin panel.')}")
        model = ask("  Model identifier", existing.get("ASHLEY_LLM_MODEL", ""))

    return {"ASHLEY_LLM_URL": url, "ASHLEY_LLM_API_KEY": key, "ASHLEY_LLM_MODEL": model}


# ── data location ─────────────────────────────────────────────────────────────

def configure_data_dir(existing: dict) -> dict:
    heading("3/7", "Where the data lives")
    print("  Characters, conversations, uploads, accounts and settings are stored")
    print("  as plain files on this machine. Put them somewhere that gets backed up.")

    default = existing.get("ASHLEY_DATA_DIR", str(ROOT / "data"))
    path = ask("\n  Data directory", default)
    resolved = Path(path).expanduser()
    print(f"  {dim('Resolved to ' + str(resolved))}")
    return {"ASHLEY_DATA_DIR": str(resolved)}


# ── access / origins ──────────────────────────────────────────────────────────

def configure_access(existing: dict) -> dict:
    heading("4/7", "How you will reach it")
    print("  Ashley listens on port 8181. If you put it behind a reverse proxy that")
    print("  terminates HTTPS, the browser's Origin header will not match what the")
    print("  app sees, and every login and message would be refused. Naming the")
    print(f"  {dim('proxied address here is what prevents that.')}")

    out = {}
    if ask_yes("\n  Will you reach Ashley through a reverse proxy / hostname?", False):
        origin = ask("  Full origin, including scheme",
                     existing.get("ASHLEY_TRUSTED_ORIGINS", "https://ashley.example.invalid"))
        out["ASHLEY_TRUSTED_ORIGINS"] = origin.rstrip("/")
        if origin.startswith("https://"):
            out["ASHLEY_COOKIE_SECURE"] = "1"
            print(f"  {dim('HTTPS detected — session cookies will be marked Secure.')}")
    else:
        out["ASHLEY_TRUSTED_ORIGINS"] = existing.get("ASHLEY_TRUSTED_ORIGINS", "")
        out["ASHLEY_COOKIE_SECURE"] = existing.get("ASHLEY_COOKIE_SECURE", "0")
        print(f"  {dim('Plain LAN access on http://<this-host>:8181')}")
    return out


# ── the parent gate ───────────────────────────────────────────────────────────

def configure_admin(existing: dict) -> dict:
    heading("5/7", "The parent's admin password")
    print("  The admin panel is where a parent sets the safety presets, manages")
    print("  accounts, and configures the model. The username is always 'Admin'")
    print("  and is never shown — the panel asks for a password only.")

    current = existing.get("ASHLEY_ADMIN_PASSWORD", "")
    if current:
        print(f"\n  {dim('An admin password is already configured.')}")
        if not ask_yes("  Change it?", False):
            return {"ASHLEY_ADMIN_PASSWORD": current}

    if ask_yes("\n  Generate a strong password for you?", True):
        pw = secrets.token_urlsafe(15)
        print(f"\n  {bold('Admin password:')} {green(pw)}")
        print(f"  {yellow('Write this down now — it is not shown again.')}")
        input(dim("  Press Enter once you have saved it. "))
    else:
        while True:
            pw = ask_secret("  Admin password (min 8 characters)")
            if len(pw) >= 8:
                break
            print(red("  Too short — use at least 8 characters."))
    return {"ASHLEY_ADMIN_PASSWORD": pw}


# ── first account ─────────────────────────────────────────────────────────────

PRESETS = [
    ("child_8_12_restrictive",
     "Child (8-12) · Gentle — warmest and most protective. No swearing, "
     "steers away from frightening or upsetting material, and suggests talking "
     "to a trusted adult more readily."),
    ("child_8_12_unhinged",
     "Child (8-12) · Playful — relaxed and funny, tolerates silliness and mild "
     "edge, still firmly child-safe."),
    ("teen_13_16_restrictive",
     "Teen (13-16) · Guided — treats them as older and more independent, but "
     "stays calm and protective around risky subjects."),
    ("teen_13_16_unhinged",
     "Teen (13-16) · Unfiltered — the most latitude in tone: swearing, dark "
     "humour and blunt talk. Tone only; the hard safety rules are unchanged."),
]


def configure_first_user(existing: dict) -> dict:
    heading("6/7", "The first account")
    print("  Ashley shows a login screen listing everyone who uses it, like a")
    print("  computer login. You can add more accounts in the admin panel later,")
    print(f"  {dim('each with its own safety preset and optional password.')}")

    name = ask("\n  First account's display name",
               existing.get("ASHLEY_DEFAULT_USER", "Alex"))

    print()
    print("  Every preset enforces the same non-negotiable rules: nothing sexual,")
    print("  no instructions for genuinely dangerous things, nothing cruel about")
    print("  real people, and it will never agree to keep secrets from a parent.")
    print(f"  {dim('The presets differ in TONE and age-appropriate framing, not in those rules.')}")

    preset = choose("  Which preset fits this account?",
                    [(p, d) for p, d in PRESETS], 0)

    return {"ASHLEY_DEFAULT_USER": name, "ASHLEY_DEFAULT_PRESET": preset}


# ── .env ──────────────────────────────────────────────────────────────────────

def load_env(path: Path) -> dict:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip()
    return out


ENV_TEMPLATE = """\
# Ashley AI configuration. Generated by install.py.
# This file holds secrets. It is gitignored and should stay mode 600.

# ── model endpoint ────────────────────────────────────────────────────────────
# Any OpenAI-compatible API. These seed the admin panel on first boot; after
# that the panel is authoritative and edits here no longer take effect.
ASHLEY_LLM_URL={ASHLEY_LLM_URL}
ASHLEY_LLM_MODEL={ASHLEY_LLM_MODEL}
ASHLEY_LLM_API_KEY={ASHLEY_LLM_API_KEY}

# ── where data lives on this host ─────────────────────────────────────────────
ASHLEY_DATA_DIR={ASHLEY_DATA_DIR}

# ── the parent gate ───────────────────────────────────────────────────────────
# Authoritative when set: re-applied on every boot, so editing this line and
# restarting IS the admin password reset path.
ASHLEY_ADMIN_PASSWORD={ASHLEY_ADMIN_PASSWORD}

# ── first boot only ───────────────────────────────────────────────────────────
# Used only when no accounts exist yet. Rename or re-preset in the admin panel.
ASHLEY_DEFAULT_USER={ASHLEY_DEFAULT_USER}
ASHLEY_DEFAULT_PRESET={ASHLEY_DEFAULT_PRESET}

# ── access ────────────────────────────────────────────────────────────────────
# Browser origins allowed to POST, beyond the one the app computes itself. A
# TLS-terminating reverse proxy MUST be listed here or every request is refused.
ASHLEY_TRUSTED_ORIGINS={ASHLEY_TRUSTED_ORIGINS}
ASHLEY_COOKIE_SECURE={ASHLEY_COOKIE_SECURE}

# ── internal secrets (generated; no reason to edit) ───────────────────────────
# Session signing. Changing it signs everyone out.
ASHLEY_SECRET_KEY={ASHLEY_SECRET_KEY}
# Backend -> pipeline authentication, internal to the compose network.
ASHLEY_PIPELINE_KEY={ASHLEY_PIPELINE_KEY}
"""


def write_env(cfg: dict) -> None:
    heading("7/7", "Writing configuration")

    body = ENV_TEMPLATE.format(**cfg)
    if ENV_PATH.exists():
        backup = ENV_PATH.with_suffix(f".env.bak-{secrets.token_hex(3)}")
        shutil.copy2(ENV_PATH, backup)
        print(f"  {dim('Existing .env backed up to ' + backup.name)}")

    ENV_PATH.write_text(body)
    try:
        os.chmod(ENV_PATH, 0o600)
    except OSError:
        pass
    print(f"  {green('✓')} wrote {ENV_PATH}")

    data_dir = Path(cfg["ASHLEY_DATA_DIR"])
    for sub in ("characters", "chats", "uploads", "auth", "config", "pipeline"):
        (data_dir / sub).mkdir(parents=True, exist_ok=True)
    for sub in ("auth", "config"):
        try:
            os.chmod(data_dir / sub, 0o700)
        except OSError:
            pass
    print(f"  {green('✓')} created data directories under {data_dir}")

    # The container runs as 950:950; the bind mounts must be writable by it.
    if platform.system() != "Windows":
        try:
            os.chown(data_dir, 950, 950)
            for sub in ("characters", "chats", "uploads", "auth", "config", "pipeline"):
                os.chown(data_dir / sub, 950, 950)
            print(f"  {green('✓')} data directories owned by 950:950 (the container's user)")
        except PermissionError:
            print(f"  {yellow('!')} could not set ownership to 950:950 — run this if the app "
                  f"cannot write:")
            print(f"    {bold('sudo chown -R 950:950 ' + str(data_dir))}")

    # The pipeline file has to be where the pipeline container expects it.
    src = ROOT / "pipeline" / "ashley_pipeline.py"
    dst = data_dir / "pipeline" / "ashley_pipeline.py"
    if src.exists():
        shutil.copy2(src, dst)
        print(f"  {green('✓')} installed the safety pipeline")


# ── launch ────────────────────────────────────────────────────────────────────

def launch() -> bool:
    print()
    if not ask_yes("  Build and start Ashley now?", True):
        return False
    print()
    build = subprocess.run(
        ["docker", "compose", "build", "ashley-backend"], cwd=ROOT
    )
    if build.returncode != 0:
        print(red("\n  Build failed. Fix the error above and re-run: docker compose build"))
        return False
    up = subprocess.run(
        ["docker", "compose", "up", "-d", "ashley-pipeline", "ashley-backend"], cwd=ROOT
    )
    if up.returncode != 0:
        print(red("\n  Start failed. Check: docker compose logs"))
        return False
    return True


def poll_health(timeout: int = 90) -> bool:
    import time

    print(f"\n  {dim('Waiting for Ashley to come up ...')}")
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            _http_get("http://127.0.0.1:8181/healthz", timeout=3)
            return True
        except Exception:
            time.sleep(2)
    return False


def print_next_steps(cfg: dict, started: bool, healthy: bool) -> None:
    print()
    hr()
    print(f"  {bold(green('Ashley AI is configured.'))}")
    hr()

    origin = cfg.get("ASHLEY_TRUSTED_ORIGINS") or "http://<this-host>:8181"
    print(f"\n  {bold('Open')}          {cyan(origin)}")
    print(f"  {bold('Admin panel')}   {cyan(origin.rstrip('/') + '/admin')}")
    print(f"                {dim('username is always Admin and is never asked for')}")

    if started:
        if healthy:
            print(f"\n  {green('✓')} running and healthy")
        else:
            print(f"\n  {yellow('!')} started, but /healthz did not answer yet.")
            print(f"    {dim('Check: docker compose logs -f ashley-backend')}")
    else:
        print(f"\n  Start it when ready:")
        print(f"    {bold('docker compose build ashley-backend')}")
        print(f"    {bold('docker compose up -d ashley-pipeline ashley-backend')}")

    print(f"\n  {bold('First things to do')}")
    print("    1. Open the admin panel and check the model connection.")
    print(f"    2. Review the safety preset for {cfg.get('ASHLEY_DEFAULT_USER', 'the account')}.")
    print("    3. Add an account for each child, each with its own preset.")
    print(f"\n  {dim('Safety model and limitations: docs/safety-model.md')}")
    print(f"  {dim('Prompt-level safety reduces risk. It does not eliminate it,')}")
    print(f"  {dim('and it is not a substitute for paying attention.')}")
    print()


def main() -> int:
    print()
    print(bold("  Ashley AI — guided install"))
    print(dim("  A self-hosted chat companion for children and teens,"))
    print(dim("  where the parent owns the safety layer."))

    if not check_prereqs():
        return 1

    existing = load_env(ENV_PATH)
    if existing:
        print(f"\n  {dim('Found an existing .env — its values are offered as defaults.')}")

    cfg: dict[str, str] = {}
    cfg.update(configure_model(existing))
    cfg.update(configure_data_dir(existing))
    cfg.update(configure_access(existing))
    cfg.update(configure_admin(existing))
    cfg.update(configure_first_user(existing))

    # Generated once and then preserved; regenerating would sign everyone out.
    cfg["ASHLEY_SECRET_KEY"] = existing.get("ASHLEY_SECRET_KEY") or secrets.token_urlsafe(48)
    cfg["ASHLEY_PIPELINE_KEY"] = existing.get("ASHLEY_PIPELINE_KEY") or secrets.token_urlsafe(32)
    cfg.setdefault("ASHLEY_TRUSTED_ORIGINS", "")
    cfg.setdefault("ASHLEY_COOKIE_SECURE", "0")

    write_env(cfg)
    started = launch()
    healthy = poll_health() if started else False
    print_next_steps(cfg, started, healthy)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nCancelled.")
        sys.exit(1)
