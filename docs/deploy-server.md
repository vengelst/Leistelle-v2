# Deploy-Server

## Zielbild

Der Server `leitstelle.vivahome.de` arbeitet im Pull-only-Modell:

- Entwicklung nur lokal auf dem PC
- Aenderungen gehen per Git nach GitHub
- der Server macht nur `git pull`
- auf dem Server wird kein Code editiert
- Betriebsartefakte bleiben separat auf dem Host

## Erwartete Zielstruktur

Empfohlene Pfade auf dem Server:

- Repo-Checkout: `/srv/leitstelle/repo`
- produktive Env-Datei: `/srv/leitstelle/repo/.env.production`
- Medienpfad: `/srv/leitstelle/media`
- Backup-Verzeichnis: `/srv/leitstelle/backups`
- nginx-Konfiguration: `/etc/nginx/sites-available/leitstelle.vivahome.de.conf`
- nginx-Symlink: `/etc/nginx/sites-enabled/leitstelle.vivahome.de.conf`

## Was aus Git kommt

- gesamter Repo-Checkout
- `docker-compose.yml`
- `deploy/nginx/leitstelle.vivahome.de.conf`
- Skripte und Doku unter `scripts/`, `docs/` und `abgleich/`

## Was nicht aus Git kommen soll

- `.env.production`
- Zertifikate und Private Keys
- WireGuard-Keys
- Backup-Dateien
- produktive Datenbankdaten
- Medieninhalte unter `/srv/leitstelle/media`

## Pull-Deploy-Ablauf

Typischer Update-Weg:

1. Lokal entwickeln und testen.
2. Nach GitHub pushen.
3. Auf dem PC `abgleich/leitstelle.ps1` ausfuehren.
4. Das Skript verbindet sich per SSH mit `root@vivahome.de`.
5. Auf dem Server laufen nur:
   - `git fetch --prune --tags origin`
   - branch- oder taggenauer Checkout
   - optionales Backup
   - optional Migration
   - optional Seed
   - `docker compose --env-file .env.production build`
   - `docker compose --env-file .env.production up -d`
   - optional `curl -fsS http://127.0.0.1:8080/health`

Wichtig:

- der Server bleibt Pull-only
- Seed laeuft nie stillschweigend mit
- das Backend fuehrt beim Containerstart keine automatische Migration und keinen automatischen Seed mehr aus

## Initial-Setup auf dem Server

1. Basispakete bereitstellen:
   - `git`
   - `docker` und `docker compose`
   - `nginx`
   - `curl`
   - `pg_dump` bzw. PostgreSQL-Clienttools
2. Zielpfade anlegen:
   - `/srv/leitstelle/repo`
   - `/srv/leitstelle/media`
   - `/srv/leitstelle/backups`
3. Repo von GitHub nach `/srv/leitstelle/repo` clonen.
4. `.env.production` im Repo-Wurzelverzeichnis auf dem Server anlegen.
5. nginx-Konfiguration aus dem Repo nach `/etc/nginx/sites-available/` uebernehmen und aktivieren.
6. Zertifikat bereitstellen.
7. Ersten Start ausfuehren:

```sh
cd /srv/leitstelle/repo
docker compose --env-file .env.production build
docker compose --env-file .env.production run --rm backend sh -lc 'node apps/backend/dist/scripts/migrate.js'
docker compose --env-file .env.production up -d
```

## Laufender Betrieb

Fuer Updates bleibt der Server code-seitig unveraendert. Es wird nur der Repo-Stand aktualisiert und der Compose-Stack neu gebaut:

```sh
cd /srv/leitstelle/repo
git pull --ff-only origin main
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
```

## Nutzung des lokalen Skripts

Das bestehende Skript `abgleich/leitstelle.ps1` unterstuetzt jetzt:

- `-Action check`
- `-Action push`
- `-Action deploy`
- `-Action all`
- `-Action version`

Wichtige Parameter:

- `-Branch "main"`
- `-Tag "v0.1.0"`
- `-Version "v0.1.0"`
- `-VersionMessage "Pilot Release Standort 1"`
- `-WhatIf`
- `-RunBackup`
- `-RunMigration`
- `-RunSeed`
- `-ConfirmSeed`
- `-SkipHealthCheck`

Beispiele:

```powershell
powershell -ExecutionPolicy Bypass -File .\abgleich\leitstelle.ps1 -Action version -Version v0.1.0 -VersionMessage "Pilot Release Standort 1"

powershell -ExecutionPolicy Bypass -File .\abgleich\leitstelle.ps1 -Action version -Version v0.1.0 -WhatIf

powershell -ExecutionPolicy Bypass -File .\abgleich\leitstelle.ps1 -Action push -Branch main -WhatIf

powershell -ExecutionPolicy Bypass -File .\abgleich\leitstelle.ps1 -Action deploy -Branch main -WhatIf

powershell -ExecutionPolicy Bypass -File .\abgleich\leitstelle.ps1 -Action deploy -Tag v0.1.0 -WhatIf

powershell -ExecutionPolicy Bypass -File .\abgleich\leitstelle.ps1 -Action all -Branch main -RunMigration -WhatIf

powershell -ExecutionPolicy Bypass -File .\abgleich\leitstelle.ps1 -Action deploy -Branch main

powershell -ExecutionPolicy Bypass -File .\abgleich\leitstelle.ps1 -Action deploy -Tag v0.1.0

powershell -ExecutionPolicy Bypass -File .\abgleich\leitstelle.ps1 -Action deploy -Branch main -RunMigration -WhatIf

powershell -ExecutionPolicy Bypass -File .\abgleich\leitstelle.ps1 -Action deploy -Branch main -RunMigration -RunSeed -ConfirmSeed

powershell -ExecutionPolicy Bypass -File .\abgleich\leitstelle.ps1 -Action deploy -Branch main -RunBackup -RunMigration

powershell -ExecutionPolicy Bypass -File .\abgleich\leitstelle.ps1 -Action deploy -Branch main -RunSeed
```

Warnung:

- `-WhatIf` fuehrt keinen Push, keinen Tag-Schreibzugriff und keine SSH-Remote-Kommandos aus, sondern zeigt nur den geplanten Ablauf
- `-WhatIf` funktioniert fuer `version`, `push`, `deploy` und `all`
- `-RunSeed` ist bewusst explizit und sollte in Produktion nur gezielt eingesetzt werden
- `-RunSeed` erfordert zusaetzlich `-ConfirmSeed`
- der Standard-Deploy fuehrt keinen Seed aus
- bei Tag-Deploy hat `-Tag` Vorrang vor `-Branch`

## Pruefung nach Deploy

- `docker compose ps`
- `curl -fsS http://127.0.0.1:8080/health`
- `docker compose logs --tail=100 backend`
- `docker compose logs --tail=100 worker`

## Rollback-Hinweis

Kein eigenes Rollback-System im Repo. Fuer einen kleinen, kontrollierten Ruecksprung:

1. im Repo auf dem Server den vorherigen Commit oder Tag auschecken
2. danach denselben Compose-Befehl erneut ausfuehren

Beispiel:

```sh
cd /srv/leitstelle/repo
git checkout <frueherer-commit-oder-tag>
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
```

Danach sollte der Server wieder auf einen branch- oder tagbasierten Sollstand gebracht werden.
