# Pilot-Go-Live

## Ziel

Diese Checkliste schliesst die repo-seitigen Minimalpunkte fuer einen Pilotbetrieb der Leitstelle, ohne neue Plattform oder Parallelarchitektur einzufuehren.

Fuer den praktischen Ablauf und die aktuelle Repo-Pruefung siehe auch:

- `docs/runbooks/pilot-site-onboarding-checklist.md`
- `docs/runbooks/pilot-site-onboarding-report.md`

## Zwingend vor Start setzen

Verwende `.env.production.example` als Vorlage und setze mindestens:

- `NODE_ENV=production`
- `DATABASE_URL`
- `AUTH_BOOTSTRAP_PASSWORD`
- `FRONTEND_ORIGIN`
- `HTTP_TRUST_PROXY=true`
- `ALARM_EXTERNAL_INGESTION_SHARED_SECRET`
- `ALARM_EXTERNAL_MEDIA_INGESTION_SHARED_SECRET`
- `MEDIA_STORAGE_TYPE`
- `MEDIA_STORAGE_BASE_URL`
- `MEDIA_STORAGE_LOCAL_PATH`

Hinweis: Im aktuellen Repo gibt es keinen separaten JWT-Secret-Parameter. Die relevante Auth-Haertung fuer den Pilot liegt beim Session-Betrieb, beim Bootstrap-Passwort und bei vorgeschaltetem TLS.

## Medien-Storage

Der Medienpfad bleibt bewusst referenzbasiert:

- der Kern speichert `storageKey`-Referenzen
- die operative Vorschau kann relative Keys ueber `MEDIA_STORAGE_BASE_URL` in aufloesbare URLs uebersetzen
- ein lokales Verzeichnis oder ein gemounteter Pfad wird nur infrastrukturseitig bereitgestellt, nicht im Repo verwaltet

Empfohlener Pilotpfad:

- lokaler oder gemounteter Medienpfad unter `/opt/leitstelle/media`
- nginx liefert diesen Pfad read-only unter `/media/` aus
- der kanonische Key `/alarms/...` wird dadurch als `https://leitstelle.vivahome.de/media/alarms/...` erreichbar

Siehe auch `docs/alarm-media-storage.md`.

## Reverse Proxy und TLS

Beispielkonfiguration:

- `deploy/nginx/leitstelle.vivahome.de.conf`

Die Annahme fuer den Pilot:

- Frontend ueber den Compose-Container auf `127.0.0.1:4173`
- Backend lokal auf `127.0.0.1:18080`
- TLS-Terminierung im nginx
- API-Proxy fuer `/api/`
- Frontend-Proxy fuer `/`
- Medienauslieferung fuer `/media/`

Ausserhalb des Repos zu erledigen:

- DNS fuer `leitstelle.vivahome.de`
- Zertifikatbereitstellung, z. B. Let's Encrypt
- Systemdienst fuer Backend/Worker

## Pilot-Stack mit Docker Compose

Der bestehende Compose-Pfad ist jetzt fuer den Pilot auf externe Werte vorbereitet. Kritische Produktionswerte wie `AUTH_BOOTSTRAP_PASSWORD` und `FRONTEND_ORIGIN` muessen aus `.env.production` oder der Umgebung kommen.

Empfohlener Start:

```sh
docker compose --env-file .env.production build
docker compose --env-file .env.production run --rm backend sh -lc 'node apps/backend/dist/scripts/migrate.js'
docker compose --env-file .env.production up -d
```

Wichtig:

- wenn die interne Compose-Datenbank genutzt wird, muessen `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` und `DATABASE_URL` zusammenpassen
- `HTTP_TRUST_PROXY` sollte im Reverse-Proxy-Betrieb auf `true` stehen
- der Backend-Container prueft seine Bereitschaft ueber `GET /health`
- der Frontend-Container prueft den nginx-Auslieferungspfad lokal
- der Worker nutzt bewusst nur einen Prozess-Liveness-Check, weil im aktuellen Aufbau kein eigener HTTP-Health-Endpoint existiert
- Migrationen werden fuer den produktiven Compose-Pfad bewusst explizit gestartet, nicht still beim Containerstart
- Seeds muessen in Produktion bewusst separat ausgeloest werden
- fuer den Pull-only-Serverbetrieb siehe auch `docs/deploy-server.md`

## Datenbank-Backup

Kleiner Grundweg fuer den Pilot:

- Script: `scripts/backup-postgres.sh`
- benoetigt `DATABASE_URL` und `pg_dump`
- erzeugt gzip-komprimierte SQL-Dumps

Beispiel:

```sh
DATABASE_URL='postgres://...' BACKUP_DIR=/var/backups/leitstelle ./scripts/backup-postgres.sh
```

Zusaetzlich sichern:

- PostgreSQL-Datenverzeichnis oder Volume
- Medienpfad unter `/opt/leitstelle/media`
- produktive `.env`-Datei in einem geschuetzten Secret-/Ops-Kontext

Einfacher Restore-Hinweis:

```sh
gunzip -c /var/backups/leitstelle/leitstelle-db-YYYYMMDD-HHMMSS.sql.gz | psql 'postgres://...'
```

## WireGuard fuer Pilotbetrieb

Repo-seitig wird keine Tunneltechnik implementiert. Erwartet wird lediglich ein Hub-and-Spoke-Setup:

- Leitstellenserver als zentraler Hub
- je Standort ein Router oder Gateway als Peer
- Standort-LAN hinter dem jeweiligen Peer
- optional ein separater PC-Testclient als eigener Peer

Siehe `docs/wireguard-pilot.md`.

## Preflight-Checkliste

- `.env.production` aus `.env.production.example` abgeleitet und mit echten Werten befuellt
- `AUTH_BOOTSTRAP_PASSWORD` nicht auf dem Entwicklungsdefault
- PostgreSQL erreichbar und Migrationen gelaufen
- Compose-Build, explizite Migration und danach `docker compose --env-file .env.production up -d` ausgefuehrt
- Backend hinter nginx nur lokal gebunden oder per Firewall eingeschraenkt
- Zertifikat fuer `leitstelle.vivahome.de` vorhanden
- `MEDIA_STORAGE_BASE_URL` zeigt auf `/media`
- Medienpfad ist lesbar und wird durch den Uploader/Gateway beschrieben
- `pg_dump` auf dem Zielsystem verfuegbar und erster Test-Backup gelaufen
- Firewall, DNS und WireGuard-Routen ausserhalb des Repos gesetzt
