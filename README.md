# ohttps-deploy

Dockerized certificate management and SSH deployment controller (MVP foundation).

## Phase progress

This table is the delivery record. A phase is only marked complete once its listed acceptance points are implemented and verified.

| Phase | Status | Current scope / remaining acceptance points |
| --- | --- | --- |
| 0. Design and security baseline | Complete for MVP | Docker, migrations, configuration validation, log redaction, initial-admin bootstrap, signed sessions, protected routes, and same-origin CSRF checks are implemented. |
| 1. Local certificate workflow | Complete for MVP | Versioned local storage, X.509/key/SAN validation, ohttps signing, Worker sync, sync-job API, and sync-job UI are implemented. |
| 2. SSH multi-server deployment | Complete for MVP | Host fingerprint validation, atomic remote replacement, queue worker, retry/cancel routes, per-target results, dry-run, target concurrency limits, and active stream cancellation are implemented. |
| 3. Web console and activity history | Complete for MVP | Certificate/server/policy/deployment screens, activity history, filters, sync history, and SSE history resume are implemented. |
| 4. Automation and notifications | Complete for MVP | Local scan, cost-aware renewal sync, automatic deployment, signed Webhook delivery, deduplication, retries, recovery events, retention cleanup, and notification management are implemented. |
| 5. Production hardening | Complete for MVP | Authentication, backup/restore, metrics, rate limiting, retention, Turso/libSQL remote support, and disaster recovery runbook are implemented. |

**Current delivery target:** run the optional Turso and disaster-recovery drills in the deployment environment.

## Local start

```bash
cp .env.example .env
pnpm install
pnpm run db:migrate
pnpm run dev
```

Open `http://localhost:3000`. The health endpoint is `GET /api/health`.

## Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Compose builds one shared image for `web` and `worker`; the Worker applies database migrations before processing tasks. All persistent files are bind-mounted in `./data` by default: the SQLite database, immutable certificate versions (`./data/certs`), and retained log archives (`./data/logs`). Set `OHTTPS_DATA_DIR` to an absolute host path to store them elsewhere.

To move an existing installation from the former named data volume, stop Compose, back up the destination directory, then copy the volume contents once:

```bash
docker run --rm -v ohttps-deploy_ssl_data:/from:ro -v "$PWD/data":/to alpine sh -c 'cp -a /from/. /to/'
```

GitHub Actions publishes the shared image to `ghcr.io/sdrpsps/ohttps-deploy`: pushes to `main` publish `latest` and a commit-SHA tag, while `v*` Git tags publish their version tag. It can also be started manually from the Actions page; no local registry credentials are needed.

Configure ohttps credentials, Webhook URL/signing secret, renewal limits, scan frequency, log retention, and the shared SSH private key in **设置**. Secrets are stored in SQLite and are never returned by the API; the Worker reads them directly. Webhook configuration is not read from environment variables. Certificate versions default to `./data/certs`, alongside the default database path. Before retention removes historic logs and audit events, the Worker writes a permission-restricted JSON archive to `LOG_ARCHIVE_DIR` (default `./data/logs`). Use **立即刷新** to enqueue an ohttps sync; it may incur an ohttps API charge. The Worker validates and stores a new immutable certificate version, then automatically creates deployments for matching enabled policies.

On first Worker startup, an `admin` account is created and its generated password is printed once in the Worker log. Set `AUTH_SECRET` to a long random value in production. Never place real ohttps keys, SSH private keys, certificates, or webhook secrets in source control.

When serving the container behind an HTTPS reverse proxy, set `BETTER_AUTH_URL` in `.env` to the exact browser-facing origin (for example, `https://certs.example.com`) and restart both Compose services. It is used for authentication and same-origin CSRF checks; do not include a trailing path.
