# Pilot-Site-Onboarding-Pruefbericht

Pruefzeitpunkt: 2026-04-12

## 1. Gesamtfazit

**Pilotstandort repo-seitig gut vorbereitet**

Die bestehende Fachlogik wirkt nach den ausgefuehrten Tests weiterhin stabil. Die Produktionsnahe ist im Repo deutlich verbessert. Die zuvor offenen repo-seitigen Compose-Haertungen fuer produktionskritische Defaults und Service-Healthchecks sind mittlerweile nachgezogen. Offen bleiben damit vor allem operative Vor-Ort-Punkte wie Reverse Proxy/TLS, echter Medienpfad, realer Standortzugang und ein echter Backup-Durchlauf.

## 2. Pruefuebersicht nach Phasen

### Phase 1 - Repo und Testbasis

Kurzfazit: Repo-seitig belastbar bestanden.

- **ERFÜLLT**: TypeScript-Build ist nachweisbar erfolgreich. Befehl: `npm run check`
- **ERFÜLLT**: Frontend-Testlauf ist nachweisbar erfolgreich. Befehl: `npm run test:frontend`, Ergebnis: 52 Tests, 52 bestanden, 0 fehlgeschlagen.
- **ERFÜLLT**: Backend-Testlauf ist nachweisbar erfolgreich. Befehl: `npm run build -w @leitstelle/backend; ...; node --test $tests`, Ergebnis: 86 Tests, 86 bestanden, 0 fehlgeschlagen.
- **ERFÜLLT**: Relevanter Smoke-Test ist nachweisbar erfolgreich. Befehl: `npm run smoke:test`, Ergebnis: 28 Tests, 28 bestanden, 0 fehlgeschlagen.
- **TEILWEISE**: Es wurde kein Git-Status-Audit fuer lokale Sonderaenderungen gemacht; die Pruefung deckt den aktuellen Workspace-Zustand funktional ab, aber nicht die Release-Disziplin.

### Phase 2 - Produktionskonfiguration und Secrets

Kurzfazit: Produktionsvorlage ist vorhanden, und der Compose-Startpfad ist repo-seitig fuer externe Produktionswerte vorbereitet.

- **ERFÜLLT**: `.env.production.example` fuehrt die relevanten Pilotvariablen fuer Datenbank, Auth, Ingestion, Medienkorrelation, Media-Storage und Worker auf.
- **ERFÜLLT**: Produktionssicherheit fuer das Bootstrap-Passwort ist fail-fast abgesichert. Nachweis: `apps/backend/src/config/runtime.ts` plus Test `apps/backend/src/tests/runtime-config.test.ts`.
- **ERFÜLLT**: Media-Storage-Konfiguration ist als Runtime-Config vorhanden (`MEDIA_STORAGE_TYPE`, `MEDIA_STORAGE_BASE_URL`, `MEDIA_STORAGE_LOCAL_PATH`).
- **ERFÜLLT**: `docker-compose.yml` zieht kritische Produktionswerte jetzt aus `.env.production` bzw. der Umgebung und enthaelt keinen festen produktionsgefaehrlichen Backend-Default mehr.
- **NUR OPERATIV TESTBAR**: Echte Secrets und echte `.env.production` wurden im aktuellen Kontext nicht gesetzt und duerfen nicht im Repo hinterlegt werden.

### Phase 3 - Datenbank, Dienste und Health

Kurzfazit: Service-Struktur und Compose-Healthchecks sind repo-seitig vorbereitet, aber nicht live auf einem Zielhost abgenommen.

- **ERFÜLLT**: `docker-compose.yml` enthaelt die Services `db`, `backend`, `frontend`, `worker`.
- **ERFÜLLT**: Die Datenbank hat im Compose-Stand einen echten Healthcheck via `pg_isready`.
- **ERFÜLLT**: Fuer Backend, Frontend und Worker sind Compose-Healthchecks hinterlegt.
- **TEILWEISE**: Der Worker-Healthcheck ist bewusst nur ein Prozess-Liveness-Check auf den echten Worker-Startprozess, weil im aktuellen Aufbau kein eigener HTTP-Health-Endpoint existiert.
- **TEILWEISE**: Zielports und Startstruktur sind repo-seitig klar (`backend` 8080, `frontend` 80 hinter nginx), aber kein echter Produktionsstart auf einem Zielhost wurde im aktuellen Kontext durchgefuehrt.
- **NUR OPERATIV TESTBAR**: Migrationen, Systemdienste und Restart-Verhalten auf dem echten Pilotserver wurden nicht vor Ort geprueft.

### Phase 4 - Reverse Proxy und TLS

Kurzfazit: nginx-Vorlage ist brauchbar, aber nicht live validiert.

- **TEILWEISE**: `deploy/nginx/leitstelle.vivahome.de.conf` ist fuer den Pilot plausibel: HTTPS-Terminierung, `/api/`-Proxy, Frontend-Proxy auf `127.0.0.1:4173` und `/media/`-Alias sind vorhanden und passen zu den repo-seitigen Pfaden.
- **ERFÜLLT**: Die Konfiguration referenziert `leitstelle.vivahome.de`, `127.0.0.1:18080`, `127.0.0.1:4173` und `/opt/leitstelle/media` konsistent mit der Doku.
- **NUR OPERATIV TESTBAR**: Zertifikatspfad, DNS, nginx-Reload und echte HTTP->HTTPS-Weiterleitung konnten im aktuellen Kontext nicht live getestet werden.
- **NUR OPERATIV TESTBAR**: Oeffentliche Erreichbarkeit und Browsertest gegen den echten Host sind ausserhalb des Repos.

### Phase 5 - Medien-Storage und Backup

Kurzfazit: Media-Storage ist repo-seitig echt verdrahtet; Backup nur teilweise verifiziert.

- **ERFÜLLT**: Media-Storage-Konfiguration ist in die bestehende Runtime eingehangt. Nachweis: `apps/backend/src/config/runtime.ts`.
- **ERFÜLLT**: Die bestehende Medienvorschau nutzt `mediaStorage.baseUrl` fuer relative `storageKey`s. Nachweis: `apps/backend/src/modules/alarm-core/media-access.ts`.
- **ERFÜLLT**: Die Verdrahtung ist per Test abgesichert. Nachweis: `apps/backend/src/tests/media-access.test.ts`.
- **TEILWEISE**: `scripts/backup-postgres.sh` ist real ausfuehrbar und faellt bei fehlender `DATABASE_URL` korrekt hart aus. Befehl: `bash "./scripts/backup-postgres.sh"`, Ergebnis: erwarteter Abbruch mit `DATABASE_URL ist nicht gesetzt.`
- **FEHLT**: `pg_dump` ist im aktuellen Laufzeitkontext nicht installiert. Befehl: `pg_dump --version`, Ergebnis: Kommando nicht gefunden.
- **NUR OPERATIV TESTBAR**: Ein echter Backup-Durchlauf gegen die Pilotdatenbank und ein Restore-Test wurden nicht durchgefuehrt.
- **NUR OPERATIV TESTBAR**: Ein echter Upload-/Gateway-Pfad in den Medienbereich ist nur auf dem Zielsystem pruefbar.

### Phase 6 - Standortdaten, Mapping und Vendor-/Medienpfade

Kurzfazit: Repo-seitig stark abgesichert und fachlich anschlussfaehig.

- **ERFÜLLT**: Standort-/Komponentenmodell ist nachweisbar vorhanden. Nachweis: Smoke-Test fuer Customer/Site/Device-Persistenz und `apps/backend/src/modules/master-data/store.ts`.
- **ERFÜLLT**: Alarmquellen-Mapping auf `componentId`, optional `nvrComponentId` und `mediaBundleProfileKey` ist im Store verdrahtet.
- **ERFÜLLT**: Vendor-Normalisierung ist per Unit-Tests fuer Dahua und Hikvision nachgewiesen. Nachweis: `apps/backend/src/tests/vendor-profiles.test.ts`.
- **ERFÜLLT**: Medienparser fuer Grundig, Dahua und Hikvision sind per Unit-Tests nachgewiesen. Nachweis: `apps/backend/src/tests/vendor-media-parser.test.ts`.
- **ERFÜLLT**: Medienkorrelation ist per Smoke-Test fuer generische externe Medieningestion nachgewiesen. Nachweis: `smoke flow correlates grundig media bundle via generic external media ingestion`.
- **ERFÜLLT**: Der Inbox-Endpunkt `GET /api/v1/alarm-media-inbox` ist verdrahtet und im Smoke-Test erfolgreich angesprochen.
- **NUR OPERATIV TESTBAR**: Echtes Mapping gegen reale Standortgeraete, echte Recorderkanaele und echte Herstellerdateinamen am Standort bleibt vor Ort zu pruefen.

### Phase 7 - Operativer Fachbetrieb, Archiv, Reporting, Monitoring und RBAC

Kurzfazit: Repo-seitig gut abgesichert.

- **ERFÜLLT**: Alarm-Lifecycle ist per Smoke-Test fuer Bearbeitung, Kommentare, Abschluss, Archivierung und Archivschutz nachgewiesen.
- **ERFÜLLT**: RBAC ist per Smoke-Test nachgewiesen, unter anderem mit 403 fuer unberechtigte Admin- und Release-Zugriffe.
- **ERFÜLLT**: Reporting und Archiv sind per Smoke-Test und Frontend-Tests nachgewiesen.
- **ERFÜLLT**: Monitoring-Pipeline, Stoerungsdetail, Quittierung und Servicefall-Anlage sind per Smoke-Test nachgewiesen.
- **ERFÜLLT**: Keine Beschaedigung bestehender Fachlogik ist durch die ausgefuehrten Tests sichtbar geworden.

### Phase 8 - Minimaler echter Abnahmetest fuer Standort 1

Kurzfazit: Im aktuellen Kontext nicht real durchfuehrbar.

- **NUR OPERATIV TESTBAR**: Echte Standortverbindung ueber WireGuard oder Standort-LAN.
- **NUR OPERATIV TESTBAR**: Testalarm von echter oder pilotnaher Quelle aus Standort 1.
- **NUR OPERATIV TESTBAR**: Echte Medienanlieferung ueber Standortpfad, FTP/SFTP/Gateway oder Hersteller-Upload.
- **NUR OPERATIV TESTBAR**: Browsertest ueber die echte Pilotdomain.
- **NUR OPERATIV TESTBAR**: Abnahme gegen echte Standortkomponenten und Monitoring-Ziele.

## 3. Real ausgefuehrte Tests

### Erfolgreich ausgefuehrt

- `npm run check`
  - Ergebnis: erfolgreich
- `npm run test:frontend`
  - Ergebnis: 52 Tests bestanden, 0 fehlgeschlagen
- `npm run build -w @leitstelle/backend; if ($LASTEXITCODE -eq 0) { $tests = Get-ChildItem -Recurse -Filter *.test.js apps/backend/dist/tests | ForEach-Object { $_.FullName }; if ($tests.Count -gt 0) { node --test $tests } else { Write-Error 'Keine Backend-Testdateien gefunden.'; exit 1 } }`
  - Ergebnis: 86 Tests bestanden, 0 fehlgeschlagen
- `npm run smoke:test`
  - Ergebnis: 28 Tests bestanden, 0 fehlgeschlagen
- `bash --version`
  - Ergebnis: `bash` im aktuellen Kontext verfuegbar

### Bewusst fehlgeschlagen bzw. als Negativtest ausgefuehrt

- `bash "./scripts/backup-postgres.sh"`
  - Ergebnis: erwarteter Abbruch, weil `DATABASE_URL` nicht gesetzt war
- `pg_dump --version`
  - Ergebnis: fehlgeschlagen, `pg_dump` im aktuellen Kontext nicht installiert

## 4. Externe / operative Pruefungen

- DNS fuer `leitstelle.vivahome.de` einrichten und auf den Zielhost zeigen lassen.
- TLS-Zertifikat beschaffen, hinterlegen und nginx damit wirklich starten.
- Echten Hostpfad fuer Frontend und Medien bereitstellen.
- `MEDIA_STORAGE_BASE_URL` gegen den echten Reverse Proxy pruefen.
- WireGuard-Hub, Standort-Router, Firewall und AllowedIPs real konfigurieren.
- Erreichbarkeit der Standortgeraete und Monitoring-Ziele aus dem Pilotnetz pruefen.
- Echte Herstelleralarme und echte Medienpfade mit Standort 1 ausloesen.
- Backup und Restore gegen die echte Pilotdatenbank nachweisen.

## 5. Pilot-Blocker

- Im aktuellen Laufzeitkontext ist `pg_dump` nicht vorhanden; ein echter Backup-Durchlauf ist daher nicht nachweisbar.
- Echte Standort-1-Abnahme mit DNS, TLS, WireGuard, Standort-LAN und realer Alarm-/Medienquelle steht noch aus.

## 6. Empfehlung

**Freigabe nur nach operativer Vorpruefung**

Repo-seitig ist der Pilotstand weitgehend vorbereitet. Vor einer echten Standortfreigabe muessen aber mindestens die operativen Punkte fuer Reverse Proxy/TLS, Backup-Werkzeuge, Standortnetz und ein realer Abnahmetest gegen Standort 1 abgeschlossen werden.
