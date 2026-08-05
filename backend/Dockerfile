FROM python:3.12-slim

# Runs as a normal user, not root. 950:950 matches the `admin` account that owns
# the bind-mounted data dirs on the host, so characters/, chats/ and
# uploads/ stay writable and files land admin-owned instead of root-owned.
ARG APP_UID=950
ARG APP_GID=950
RUN groupadd -g "${APP_GID}" ashley \
 && useradd -u "${APP_UID}" -g "${APP_GID}" -M -d /app -s /usr/sbin/nologin ashley

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

# /data is bind-mounted from the host (characters/ chats/ uploads/ auth/).
# No VOLUME declaration: it would mask the bind mounts' ownership handling
# and create anonymous volumes on every rebuild.
# No secrets are copied or baked in -- everything sensitive arrives as an
# environment variable at run time from the host's chmod-600 .env.

USER ashley

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0) if urllib.request.urlopen('http://127.0.0.1:5000/healthz',timeout=4).status==200 else sys.exit(1)"

# gunicorn, not the Flask dev server.
# One worker with threads, deliberately: the login rate limiter and the
# first-run credential bootstrap are process-local, and this app serves one
# family on a LAN. Threads cover the long-running model calls.
CMD ["gunicorn", \
     "--bind", "0.0.0.0:5000", \
     "--workers", "1", \
     "--threads", "8", \
     "--timeout", "300", \
     "--graceful-timeout", "30", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--forwarded-allow-ips", "", \
     "server:app"]
