#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  # A bind mount is created with the host user's ownership, not the image's.
  chown -hR app:app /app/data
  exec su-exec app "$0" "$@"
fi

if [ "${SKIP_DB_MIGRATION:-0}" != "1" ]; then
  node --import tsx app/db/migrate.ts
fi

exec "$@"
