# Pilot-Site-Onboarding-Checkliste

Praktisches Runbook fuer die Inbetriebnahme eines Pilotstandorts auf dem bestehenden Leitstellen-Repo.

## Phase 1 - Repo und Testbasis

Zweck: Vor dem Standortstart sicherstellen, dass der aktuelle Stand baubar und testbar ist.

- [ ] `npm run check` erfolgreich
- [ ] `npm run test:frontend` erfolgreich
- [ ] Backend-Tests erfolgreich
- [ ] `npm run smoke:test` erfolgreich
- [ ] Keine ungeprueften lokalen Sonderaenderungen fuer den Piloteinsatz offen

## Phase 2 - Produktionskonfiguration und Secrets

Zweck: Produktionsnahe Konfiguration ohne unsichere Defaults vorbereiten.

- [ ] `.env.production` aus `.env.production.example` ableiten
- [ ] `DATABASE_URL` mit echtem Zielsystem setzen
- [ ] `AUTH_BOOTSTRAP_PASSWORD` mit langem, extern gesetztem Wert setzen
- [ ] `ALARM_EXTERNAL_INGESTION_SHARED_SECRET` setzen
- [ ] `ALARM_EXTERNAL_MEDIA_INGESTION_SHARED_SECRET` setzen
- [ ] `FRONTEND_ORIGIN=https://leitstelle.vivahome.de` setzen
- [ ] `HTTP_TRUST_PROXY=true` setzen
- [ ] `MEDIA_STORAGE_TYPE`, `MEDIA_STORAGE_BASE_URL` und `MEDIA_STORAGE_LOCAL_PATH` setzen
- [ ] Falls `docker-compose.yml` genutzt wird: Defaults vor Nutzung auf produktive Werte anpassen

## Phase 3 - Datenbank, Dienste und Laufzeit

Zweck: Backend, Frontend und Worker auf einer belastbaren Laufzeitbasis starten.

- [ ] PostgreSQL-Zielsystem bereitstellen
- [ ] Migrationen erfolgreich ausfuehren
- [ ] Backend-Dienst mit `NODE_ENV=production` starten
- [ ] Frontend-Build ausrollen
- [ ] Worker-Dienst starten
- [ ] Start-/Restart-Mechanik ausserhalb des Repos als Systemdienst einrichten
- [ ] Healthchecks fuer Datenbank und Dienste pruefen

## Phase 4 - Reverse Proxy und TLS

Zweck: Pilotzugang ueber die oeffentliche Adresse sauber terminieren.

- [ ] nginx-Konfiguration aus `deploy/nginx/leitstelle.vivahome.de.conf` auf Zielsystem uebernehmen
- [ ] Frontend-Container lokal unter `127.0.0.1:4173` erreichbar machen
- [ ] Backend lokal unter `127.0.0.1:18080` erreichbar machen
- [ ] Zertifikat fuer `leitstelle.vivahome.de` bereitstellen
- [ ] HTTP->HTTPS-Weiterleitung pruefen
- [ ] `/api/`-Proxy pruefen
- [ ] Frontend-Proxy fuer `/` pruefen

## Phase 5 - Medien-Storage und Backup

Zweck: Medienreferenzen und Grundsicherung fuer Pilotbetrieb betriebsfaehig machen.

- [ ] Medienpfad unter `/opt/leitstelle/media` oder aequivalent bereitstellen
- [ ] `MEDIA_STORAGE_BASE_URL` zeigt auf `/media`
- [ ] Relative `storageKey`-Pfade sind ueber Reverse Proxy erreichbar
- [ ] Upload-/Gateway-Pfad schreibt in den vorgesehenen Medienbereich
- [ ] `pg_dump` auf dem Zielsystem verfuegbar
- [ ] `scripts/backup-postgres.sh` mit echter `DATABASE_URL` erfolgreich getestet
- [ ] Backup-Zielpfad definiert
- [ ] Restore-Hinweis einmal trocken gegen Testumgebung geprueft

## Phase 6 - Standortdaten, Mapping und Vendor-Pfade

Zweck: Standort 1 fachlich korrekt an den bestehenden Alarmkern anschliessen.

- [ ] Kunde und Standort angelegt
- [ ] Komponenten/Geraete fuer Standort 1 angelegt
- [ ] `alarm_source_mappings` fuer relevante Alarmquellen gepflegt
- [ ] `componentId` und falls noetig `nvrComponentId` korrekt gesetzt
- [ ] Passendes `mediaBundleProfileKey` fuer den Standort gesetzt
- [ ] Vendor-spezifische Alarmquelle liefert auf bestehende Endpunkte
- [ ] Medienparser-/Korrelationserwartung fuer den Standort dokumentiert
- [ ] Inbox-Monitoring-Endpunkt fuer technische Kontrolle verfuegbar

## Phase 7 - Operativer Betrieb und Monitoring

Zweck: Operative Kernablaeufe vor Pilotstart einmal durchgehen.

- [ ] Alarmannahme, Reservierung und Bearbeitung im bestehenden Workspace pruefen
- [ ] Follow-up / Wiedervorlage pruefen
- [ ] Eskalation / Fristanzeige pruefen
- [ ] Archivierung und Report-Export pruefen
- [ ] Monitoring-Pipeline, Quittierung und Servicefall-Anlage pruefen
- [ ] Rollen-/Rechtebild fuer Administrator, Leitstellenleitung und Operator pruefen

## Phase 8 - Standort 1 Abnahme

Zweck: Kleinen echten End-to-End-Test fuer den Pilotstandort sauber abnehmen.

- [ ] WireGuard-/Netzpfad zum Standort steht
- [ ] Standort-Router und Standort-LAN erreichbar
- [ ] Testalarm von echter oder pilotnaher Quelle an Backend gesendet
- [ ] Alarm erscheint in der offenen Pipeline
- [ ] Zugeordnete Komponente stimmt
- [ ] Medien kommen im erwarteten Pfad oder in der Inbox an
- [ ] Operator kann Alarm bearbeiten, kommentieren und abschliessen
- [ ] Monitoring-Stoerung kann gelesen und quittiert werden

## Minimaler echter Abnahmetest fuer Standort 1

1. Backend, Frontend, Worker und nginx auf Zielsystem starten.
2. Mit Operator-Account anmelden.
3. Einen echten oder pilotnahen Testalarm von Standort 1 ausloesen.
4. Pruefen, dass der Alarm im bestehenden Alarm-Workspace erscheint und auf die erwartete Komponente gemappt ist.
5. Falls Medien erwartet werden: `GET /api/v1/alarm-media-inbox` fuer den Standort pruefen und danach den Alarmfalldetailpfad kontrollieren.
6. Alarm reservieren, kommentieren, bewerten und abschliessen.
7. Optional eine Monitoring-Stoerung fuer Standort 1 pruefen, quittieren und Servicefall anlegen.
8. Einen Backup-Test mit echter `DATABASE_URL` durchfuehren und das Ergebnis protokollieren.

## Nicht im Repo loesen

- DNS fuer `leitstelle.vivahome.de`
- TLS-Zertifikat
- WireGuard-Peers und Firewall
- Standort-Router, Kameras, NVRs und Uploadpfade
- Betriebssystemdienste, Mounts und Dateiberechtigungen
