# ohttps-deploy

Dockerized certificate management and SSH deployment controller (MVP foundation).

## Phase progress

This table is the delivery record. A phase is only marked complete once its listed acceptance points are implemented and verified.

| Phase | Status | Current scope / remaining acceptance points |
| --- | --- | --- |
| 0. Design and security baseline | Partial | Docker, migrations, configuration validation, and log redaction exist. Initial-admin bootstrap and production authentication remain for Phase 5. |
| 1. Local certificate workflow | Partial | Versioned local storage, X.509/key/SAN validation, and ohttps signing exist. Worker-backed manual sync is now included; task-detail UI for sync jobs remains. |
| 2. SSH multi-server deployment | Partial | Host fingerprint validation, atomic remote replacement, queue worker, retry/cancel routes, and per-target results exist. Dry-run, target concurrency limits, and process-level cancellation remain. |
| 3. Web console and activity history | Partial | Certificate/server/policy/deployment screens, activity history, and SSE routes exist. Authentication and complete task filtering remain. |
| 4. Automation and notifications | In progress | Local certificate scan, cost-aware renewal sync, automatic deployment on a new version, signed Webhook delivery, deduplication, and retry are implemented. Expiry recovery events and a notification management UI remain. |
| 5. Production hardening | Not started | Authentication, backup/recovery, PostgreSQL compatibility, metrics, rate limits, and disaster recovery. |

**Current delivery target:** finish the remaining Phase 4 acceptance points, then close prior partial items before declaring any phase complete.

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

The container entrypoint applies database migrations automatically. Persistent volumes hold SQLite data, certificate versions, and logs.

Configure ohttps credentials, Webhook URL/signing secret, renewal limits, scan frequency, log retention, and the shared SSH private key in **设置**. Secrets are stored in SQLite and are never returned by the API; the Worker reads them directly. Webhook configuration is not read from environment variables. Certificate versions default to `./data/certs`, alongside the default database path. Use **立即刷新** to enqueue an ohttps sync; it may incur an ohttps API charge. The Worker validates and stores a new immutable certificate version, then automatically creates deployments for matching enabled policies.

The initial admin account and future secret-management flow are intentionally reserved for the authentication phase. Never place real ohttps keys, SSH private keys, certificates, or webhook secrets in source control.
