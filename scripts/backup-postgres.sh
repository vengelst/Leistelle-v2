#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_FILE="${BACKUP_DIR}/leitstelle-db-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

if [ -n "${PGHOST:-}" ]; then
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
elif [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "${DATABASE_URL}" --format=plain --no-owner --no-privileges | gzip -9 > "${OUTPUT_FILE}"
else
  echo "Weder PGHOST noch DATABASE_URL sind gesetzt." >&2
  exit 1
fi

echo "Backup geschrieben: ${OUTPUT_FILE}"

if [ "${BACKUP_RETENTION_DAYS}" -gt 0 ] 2>/dev/null; then
  find "${BACKUP_DIR}" \
    -maxdepth 1 \
    -type f \
    -name 'leitstelle-db-*.sql.gz' \
    -mtime +"${BACKUP_RETENTION_DAYS}" \
    -print \
    -delete
fi
