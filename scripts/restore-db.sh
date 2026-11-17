#!/usr/bin/env sh
set -eu
if [ "${1:-}" = "" ] || [ ! -f "$1" ]; then
  echo "Usage: $0 backups/uborka-YYYYMMDDTHHMMSSZ.sql.gz" >&2
  exit 2
fi
printf 'This replaces the current database. Type RESTORE to continue: '
read answer
[ "$answer" = "RESTORE" ] || exit 1
gzip -dc "$1" | docker compose exec -T db psql -U uborka -d uborka
