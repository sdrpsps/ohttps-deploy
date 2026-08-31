# SSL Deploy

Dockerized certificate management and SSH deployment controller (MVP foundation).

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

Set the shared SSH private key in **设置** by pasting its PEM content. It is stored as a secret SQLite setting, never returned by the API, and is read directly by the Worker; no key file is mounted or configured.

The initial admin account and future secret-management flow are intentionally reserved for the authentication phase. Never place real ohttps keys, SSH private keys, certificates, or webhook secrets in source control.
