#!/bin/sh
set -eu

if [ "${SKIP_DB_MIGRATION:-0}" != "1" ]; then
  node --import tsx app/db/migrate.ts
fi

exec "$@"
