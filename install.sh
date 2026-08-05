#!/usr/bin/env bash
# Ashley AI guided installer (Linux / macOS).
# Delegates to the cross-platform Python wizard so there is one real implementation.
set -euo pipefail
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then PY=python3
elif command -v python >/dev/null 2>&1; then PY=python
else
  echo "Python 3.9+ is required. Install it (https://www.python.org/downloads/) and re-run." >&2
  exit 1
fi
exec "$PY" install.py "$@"
