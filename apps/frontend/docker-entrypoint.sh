#!/bin/sh
set -eu

if [ -z "${FRONTEND_API_BASE_URL:-}" ]; then
  echo "[leitstelle-config] FEHLER: FRONTEND_API_BASE_URL ist nicht gesetzt. Frontend-Container wird nicht gestartet." >&2
  exit 1
fi

envsubst '${FRONTEND_API_BASE_URL}' \
  < /opt/leitstelle/config.template.js \
  > /usr/share/nginx/html/config.js
