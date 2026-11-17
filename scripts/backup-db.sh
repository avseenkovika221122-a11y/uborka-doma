#!/usr/bin/env sh
set -eu
mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="backups/uborka-${stamp}.sql.gz"
docker compose exec -T db pg_dump -U uborka -d uborka | gzip > "$file"
echo "Created $file"
