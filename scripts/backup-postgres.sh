#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_FILE="${BACKUP_DIR}/leitstelle-db-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "${DATABASE_URL}" --format=plain --no-owner --no-privileges | gzip -9 > "${OUTPUT_FILE}"
else
  : "${PGHOST:?PGHOST ist nicht gesetzt.}"
  : "${PGPORT:?PGPORT ist nicht gesetzt.}"
  : "${PGUSER:?PGUSER ist nicht gesetzt.}"
  : "${PGPASSWORD:?PGPASSWORD ist nicht gesetzt.}"
  : "${PGDATABASE:?PGDATABASE ist nicht gesetzt.}"
  pg_dump \
    --host "${PGHOST}" \
    --port "${PGPORT}" \
    --username "${PGUSER}" \
    --dbname "${PGDATABASE}" \
    --format=plain \
    --no-owner \
    --no-privileges | gzip -9 > "${OUTPUT_FILE}"
fi

echo "Backup geschrieben: ${OUTPUT_FILE}"
