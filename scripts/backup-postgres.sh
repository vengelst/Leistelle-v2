#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL ist nicht gesetzt." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_FILE="${BACKUP_DIR}/leitstelle-db-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

pg_dump "${DATABASE_URL}" --format=plain --no-owner --no-privileges | gzip -9 > "${OUTPUT_FILE}"

echo "Backup geschrieben: ${OUTPUT_FILE}"
