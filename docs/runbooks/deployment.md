# Runbook — Deployment

How to deploy MasterHand with Docker Compose. TLS is **not** bundled with the project: you choose how to terminate HTTPS.

## 1. Prerequisites

- A host with Docker and Docker Compose.
- A domain (optional but recommended) pointing at the host.
- Model provider API keys available to the opencode container.

## 2. Prepare the environment

```bash
cp deploy/.env.example deploy/.env
```

Fill in `deploy/.env`:

| Variable | Purpose |
|---|---|
| `MASTERHAND_PASSWORD` | Password to access the UI |
| `SESSION_SECRET` | Cookie/token signing secret (`openssl rand -hex 32`) |
| `OPENCODE_SERVER_PASSWORD` | Password for the internal opencode server |
| `SESSION_TTL_HOURS` | Session lifetime in hours (default `720`) |
| `COOKIE_SECURE` | Set `true` behind HTTPS, `false` only for local HTTP |
| `ALLOWED_ORIGINS` | Extra origins allowed on mutating requests (comma-separated) |
| `MASTERHAND_BIND` / `MASTERHAND_PORT` | Host bind address and port for the BFF (default `0.0.0.0:8787`; use `127.0.0.1` when the proxy runs on the host) |
| `OPENCODE_VERSION` | Pinned opencode version |

## 3. Start the stack

```bash
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml ps
```

The BFF is published on a host port (default `8787`, configurable with `MASTERHAND_PORT`/`MASTERHAND_BIND`). opencode stays on the internal network and publishes no ports.

## 4. Authenticate providers (one-time)

```bash
docker compose -f deploy/docker-compose.yml run --rm opencode auth login
```

Credentials persist in the `opencode_config` volume.

## 5. Put TLS in front

Point your chosen reverse proxy / tunnel at the BFF port. Examples:

### Caddy (automatic Let's Encrypt)

```caddyfile
masterhand.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8787 {
        flush_interval -1   # no buffering for SSE
    }
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
}
```

### Nginx (with certbot-managed certificates)

```nginx
server {
    listen 443 ssl;
    server_name masterhand.example.com;
    # ssl_certificate / ssl_certificate_key ...

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;          # required for SSE
        proxy_read_timeout 3600s;
    }
}
```

### Other options

- Traefik with a Let's Encrypt resolver.
- A tunnel (Cloudflare Tunnel, Tailscale Funnel) if you cannot open ports.

Whatever you use, **disable response buffering for SSE** (`/api/events`) and forward `X-Forwarded-For`/`X-Forwarded-Proto`.

## 6. Verify

- `GET https://<your-domain>/api/health` returns `{ "ok": true }`.
- Log in from web, desktop and mobile.
- An external scan shows only the proxy port and SSH open; opencode is unreachable from outside.

## 7. Upgrade and backups

```bash
# upgrade
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d

# backups (example)
docker run --rm -v masterhand_masterhand_data:/data -v "$PWD":/backup busybox \
  tar czf /backup/masterhand_data.tgz -C /data .
```

Back up the volumes `masterhand_data`, `opencode_data` and `opencode_config`.
