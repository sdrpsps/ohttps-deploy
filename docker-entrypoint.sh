#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  data_uid="$(stat -c '%u' /app/data 2>/dev/null || echo '')"
  data_gid="$(stat -c '%g' /app/data 2>/dev/null || echo '')"

  if [ -n "${PUID:-}" ] || [ -n "${PGID:-}" ]; then
    target_uid="${PUID:-$(id -u app)}"
    target_gid="${PGID:-${PUID:-$(id -g app)}}"
  elif [ -n "$data_uid" ] && [ "$data_uid" -ge 1000 ] 2>/dev/null; then
    target_uid="$data_uid"
    target_gid="${data_gid:-$data_uid}"
  else
    target_uid="$(id -u app)"
    target_gid="$(id -g app)"
  fi

  case "$target_uid" in
    ''|*[!0-9]*|0)
      echo "Invalid target UID: '$target_uid' (must be a positive integer)" >&2
      exit 1
      ;;
  esac

  case "$target_gid" in
    ''|*[!0-9]*)
      echo "Invalid target GID: '$target_gid' (must be a non-negative integer)" >&2
      exit 1
      ;;
  esac

  # A bind mount is created with the host user's ownership, not the image's.
  chown -hR "${target_uid}:${target_gid}" /app/data
  exec su-exec "${target_uid}:${target_gid}" "$0" "$@"
fi

if [ "${SKIP_DB_MIGRATION:-0}" != "1" ]; then
  node --import tsx app/db/migrate.ts
fi

exec "$@"
