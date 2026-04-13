# AGENTS

## Zielbild

Dieses Repository bildet das technische Fundament und die aktuellen operativen Kernmodule der Leitstellensoftware. Die aktuelle Ausbaustufe reicht von **M1 bis M7**:

- M1-M3 sind abgeschlossen: Foundation, Identity/Access und fachliche Stammdaten.
- M3.5 ist abgeschlossen: PostgreSQL, Migrationen, Docker-Compose, DB-Backed Stores, Multi-Role-Support, Input-Validierung und persistentes Audit.
- M4 ist abgeschlossen: Alarm-Core inklusive Schema, Ingestion, Pipeline, Reservierung/Zuweisung, Bewertung, Abschluss, Archivierung und Falldetails.
- M5 ist abgeschlossen: Workflow-Kataloge, Massnahmen-Dokumentation, Einsatzanweisungen und verbesserter Alarm-UX im offenen Fall.
- M6 ist abgeschlossen: Monitoring-Datenmodell, Pruef-/Scan-Logik, Stoerungspipeline, technische Detailsicht und Servicefall-Anlage aus technischer Stoerung.
- M7 ist vorhanden: Geo-Koordinaten fuer Standorte, Marker-Endpoint, operative DACH-Karte, Karten-Schnellwege in Alarm/Stoerung/Service sowie Objekt-/Kameraplan im Standortkontext.

## Modulgrenzen

- `apps/backend`: HTTP-API, Systemgrenzen, Request-Kontext, Fehlerabbildung und technische Entry-Points.
- `apps/frontend`: UI-Shell, Layout-Grundgeruest und Frontend-Komposition ohne Fachscreens.
- `workers/runtime`: Hintergrundprozess-Runtime und Job-Registrierung ohne Fachjobs.
- `packages/contracts`: gemeinsame Typen und API-Vertraege.
- `packages/config`: zentrale Konfigurationsbausteine und Environment-Zugriff.
- `packages/observability`: Logging, Audit-Events und technische Fehlerklassen.
- `apps/backend/src/db`: PostgreSQL-Client, Migrationen, Seeds und Persistenzhilfen.
- `apps/backend/src/modules/identity`: Authentifizierung, Session-Grundlage, Rollen- und Benutzerstatuslogik ohne Alarm- oder Standortbezug.
- `apps/backend/src/modules/master-data`: Standorte, Geraete, technische Zugangsdaten, Standortkonfigurationen und Plan-Grunddaten.
- `apps/backend/src/modules/alarm-core`: Alarm-Schema, Ingestion, offene Pipeline, Reservierung/Zuweisung, Bewertung, Kommentare, Actions, Close, Archive, Detailansicht und zugehoerige Audit-/Fallakten-Anknuepfungspunkte.
- `apps/backend/src/modules/monitoring`: technische Stoerungen, Monitoring-Pruef-/Scan-Logik, Stoerungspipeline, Stoerungsdetails, Notizen, Quittierung und Servicefall-Anlage aus Stoerung.
- `map` ist aktuell kein eigenes Backend-Modul. Die Kartenbasis nutzt Geo-Daten aus `master-data`, Marker-Daten aus dem bestehenden Standortmarker-Endpoint und die operative DACH-Karte im Frontend unter `apps/frontend`.

## Regeln fuer weitere Agentenarbeit

- Nur in die bestehende Modulstruktur erweitern, keine alternativen Parallelpfade anlegen.
- Fachlogik erst in den vorgesehenen Modulen umsetzen; Infrastruktur bleibt generisch.
- Gemeinsame Typen immer in `packages/contracts` halten, nicht zwischen Frontend und Backend duplizieren.
- Konfigurationszugriffe zentral ueber `packages/config` fuehren.
- Logging nie direkt mit `console.*` streuen; stattdessen die Bausteine aus `packages/observability` verwenden.
- Audit-Events fuer Benutzerzugriff, Login-Fehlversuche und Statuswechsel ueber `packages/observability` fuehren.
- Persistente Daten ausschliesslich ueber die PostgreSQL-Schicht in `apps/backend/src/db` und modulnahe DB-Stores modellieren; keine neuen In-Memory-Fallbacks einfuehren.
- Datenbankschema nur ueber versionierte SQL-Migrationen in `apps/backend/migrations` erweitern.
- Seed-Daten nur fuer lokale Entwicklungs- und Smoke-Test-Flows vorbereiten, nicht als Fachersatz missbrauchen.
- Stammdatenmodelle zentral in `packages/contracts` halten und nicht lokal pro Modul neu erfinden.
- Neue HTTP-Endpunkte muessen versioniert unter `/api/v1` liegen.
- Request-Bodies an der HTTP-Grenze validieren; keine unvalidierten JSON-Casts in Services oder Stores durchreichen.
- Fehler ueber definierte Fehlerklassen und Problem-Details abbilden, keine ad-hoc-Responses.
- Benutzerstatus `assigned_to_alarm` in M2 nur als Datenmodell und Integrationspunkt vorbereiten, nicht fachlich an Alarmprozesse anbinden.
- Logout-Sperren nur ueber vorbereitete Guards modellieren; keine Fake-Pruefungen fuer offene Alarme einbauen.
- Benutzer koennen mehrere Rollen tragen; Berechtigungen daher immer gegen `roles[]` pruefen und `primaryRole` nur fuer Praesentation oder Default-Zuordnung nutzen.
- `Customer` ist eigenstaendige Stammdaten-Entitaet; Standorte referenzieren `customerId` statt Freitext-Namen.
- Technische Zugangsdaten nur fuer freigegebene Rollen sichtbar machen; fuer andere Rollen nur redigierte Strukturen liefern.
- Bevor Struktur geaendert wird, bestehende Pfade pruefen und erweitern statt verschieben.
- `alarm-core` ist das zentrale operative Alarmmodul. Dort liegt die Logik fuer Alarmannahme, Pipeline, Reservierung, Bewertung, Abschluss, Archivierung und Falldetails; diese Logik darf nicht in spaetere Module dupliziert werden.
- `alarm-core` enthaelt Ingestion, Pipeline, Reservierung, Bewertung, Close, Archive, Fallakte und Actions; es enthaelt nicht Monitoring-Ausfuehrung, Reporting oder Schichtplanung.
- Status (`lifecycleStatus`) und Bewertung (`assessmentStatus`) strikt getrennt halten; technische Probleme bleiben in der technischen Dimension und duerfen nicht wieder in die Bewertung rueckgemischt werden.
- Archivierte Alarmfaelle sind schreibgeschuetzt. Folgearbeiten muessen diesen Archivschutz respektieren und duerfen keine stillen Schreibpfade an archivierten Faellen einfuehren.
- `monitoring` enthaelt technische Stoerungen, Pruef-/Scan-Logik, Stoerungspipeline und Servicefall-Anlage aus Stoerung; es enthaelt nicht Alarm-Core-Logik, Reporting oder Karten-Rendering.
- Monitoring und `alarm-core` bleiben fachlich getrennt. Keine Assignment-, Assessment-, Stoerungs- oder Servicefall-Logik zwischen beiden Modulen vermischen oder duplizieren.
- Karten-/Geo-Logik bleibt leichtgewichtig: Standorte koennen Geo-Koordinaten tragen, `GET /api/v1/map/site-markers` liefert Marker-Grunddaten, die DACH-Karte lebt im Frontend, und Objekt-/Kameraplaene werden im Standortkontext genutzt statt als eigene Parallelwelt modelliert.
- Keine Workflow-Engine ohne expliziten Auftrag einfuehren.
- Keine Reporting-, Schichtplanungs- oder Benachrichtigungslogik in fachfremde Milestones ziehen.

## Naechste Ziele

- Weitere Karten-/Plan-Erweiterungen muessen auf den bestehenden Geo-, Marker- und Standortplan-Pfaden aufsetzen, ohne neue Parallelmodelle fuer Karten oder Plaene einzufuehren.
- Spaetere Module fuer Reporting, Dashboard, Benachrichtigungen oder Schichtplanung bleiben fachlich und technisch getrennt von `alarm-core`, `monitoring` und den bestehenden Kartenpfaden.

## Arbeitsmodus

- Klein, nachvollziehbar und belastbar bauen.
- Kommentare sparsam halten und nur dort setzen, wo Struktur oder Absicht sonst unklar waere.
- Wenn spaetere Milestones Vorbereitung brauchen, nur Schnittstellen und Erweitertungspunkte anlegen, keine Scheinimplementierungen.
- Im Frontend Refreshes so lokal wie moeglich halten; keine pauschalen Workspace-Reloads einfuehren, wenn ein Detail-, Listen- oder Katalog-Refresh ausreicht.
- Mehrstufige asynchrone Frontend-Flows mit zusammengehoerigen State-Aenderungen ueber vorhandenes Render-Batching stabilisieren statt Zwischenrenders zu verketten.
- DOM-Preservation im Frontend gezielt und opt-in ueber `data-ui-preserve-form` und `data-ui-preserve-scroll` erweitern; keine globale Wiederherstellung fuer fachlich fluechtige oder bewusst resetbare Formulare einfuehren.
- Periodische technische Hintergrundlaeufe zentral in `workers/runtime` verankern; keine versteckte Scheduling-Logik in HTTP-Startpfaden, Controllern oder Modulservices verteilen.
- Monitoring-Worker muessen fuer operative Zyklen den bestehenden Backend-Job bzw. die bestehenden Monitoring-Services wiederverwenden; die Scan-, Retry-, Recovery- und Stoerungspipeline-Logik darf nicht im Worker dupliziert werden.
- Objekt-/Kameraplaene im Frontend immer als lokaler Standortkontext auf bestehender `site_plans`-/`plan_markers`-Struktur aufbauen; keine zweite Kartenplattform oder parallele Planlogik neben der DACH-Karte einfuehren.
- M8-Archivsicht, Reporting und Exporte bleiben Sicht- und Dokumentationsschichten auf bestehenden Alarm-, Stoerungs-, Audit- und Archivdaten; keine Duplikatdatenhaltung, keine neue BI- oder Dokumentenplattform und keine Vermischung von `alarm-core` und `monitoring` ueber kuenstliche Oberstatusmodelle einfuehren.
- M9-Schichtplanung bleibt ein eigenes operatives Planungsmodul fuer die Leitstelle: Benutzer, Rollen und Sessions bleiben in `identity` fuehrend; geplanter Dienst und aktuelle Ist-Praesenz duerfen sichtbar verbunden, aber nicht still synchronisiert oder ueber gemeinsame Statusmodelle vermischt werden.
- Dedizierte Leitstellen-Operator- oder Alarmannahme-Screens bleiben fokussierte UI-Sichten auf die bestehende Alarm-Pipeline, Reservierung, Medien-, Kommentar-, Massnahmen- und Planlogik; keine zweite Pipeline, keine neue Queue-/Dispatch-Engine und keine parallele Medien- oder Kartenwelt einfuehren.
- Wallboard-/Grossbildschirmmodi bleiben read-only Anzeigezuschnitte auf bestehende Leitstellenquellen wie Alarm-, Stoerungs-, Dashboard-, Besetzungs- und Schichtdaten; keine eigene Fachlogik, keine neue Backend-API, keine zweite Dashboard-/Operator-Welt und keine separaten Refresh-Inseln einfuehren.
- Auto-Refresh fuer Alarm-Pipeline und Leitstellen-Operator-Sichten bleibt ein zentraler technischer Aktualisierungspfad auf bestehende Alarm-Endpoints; keine View-spezifischen Mehrfachtimer, keine zweite Datenquelle und keine Push-/Realtime-Parallelarchitektur ohne ausdruecklichen Auftrag einfuehren.
- Auto-Refresh fuer Leitstellen-Pipelines bleibt zentral ueber einen gemeinsamen technischen Refresh-Pfad organisiert; Alarm- und Stoerungspipeline duerfen dabei keine getrennten globalen Timer- oder Listener-Inseln ausbilden.
- Operative Medienvorschau fuer aktive Alarmfaelle bleibt ein eng begrenzter Zugriffspfad auf bestehende Alarmmedienreferenzen im Fallkontext; Archivzugriff, Download-/Manifestlogik und historische Mediennutzung bleiben davon klar getrennt.
- Auto-Zuordnung light fuer neue Alarme darf hoechstens ein optionaler technischer Trigger auf die bestehende Reservierungslogik sein; als Minimalverfuegbarkeit gelten nur bereits vorhandene Session-/Statusdaten, und es duerfen keine verdeckten Dispatch-, Lastverteilungs-, Skill- oder Schichtregeln eingefuehrt werden.
- Externe Alarmquellen bleiben eine schmale Adapter- und Normalisierungsschicht vor der bestehenden Alarm-Ingestion: Hersteller- oder Standortspezifika bleiben am Rand, `alarm-core` bleibt fachlich fuehrend, und es duerfen weder eine zweite Alarmpipeline noch eine separate Medien-, Workflow- oder Dispatch-Welt entstehen.
- Konkrete Herstelleradapter wie Dahua- oder Grundig-/NVR-Pfade bleiben kleine Uebersetzer auf den bestehenden externen Ingestion-Vertrag; kein Multi-Vendor-Framework, keine versteckte Herstellerlogik im Kern und keine neue Sicherheits- oder Medienplattform darum herum aufbauen.
- Hub-/CMS-/Cloud-nahe Integrationen wie AJAX Hub 2 (4G) Jeweller muessen als eigener Ereignispfad modelliert bleiben und duerfen nicht fachlich oder semantisch in Recorder-/NVR-Adapterlogik hineingezogen werden; sie bleiben ebenfalls nur schmale Uebersetzer auf den bestehenden externen Ingestion-Vertrag.
- Vor vendor-nahen AJAX-Hub-Adaptern sind spaetere Collector-Stubs fuer Cloud-/CMS-/Enterprise-Eingaenge nur als sehr duenne Randschicht erlaubt: minimal validieren, leicht in das vorhandene AJAX-Hub-Eingangsmodell uebersetzen und danach direkt an den bestehenden Adapter delegieren, ohne eigene Alarm-, Medien-, Sync- oder Plattformlogik aufzubauen.
- AJAX NVR-/Video-/Recorder-Pfade sind davon strikt getrennt zu halten: sie duerfen sich an Recorder-Adaptern wie Dahua/Grundig orientieren, muessen aber weiterhin nur in den bestehenden externen Ingestion-Vertrag uebersetzen und duerfen keine Hub-/Jeweller-/CMS-Semantik oder neue Video-Plattformlogik in den Kern eintragen.
- Direkte Kamera-/Analytics-Adapter, z. B. fuer Grundig-GU-IP-Kameras, sind nochmals separat zu behandeln: kein Recorder-Default, kein Hub-Default, sondern ein eigener schmaler Kamera-Rand mit kamera-nahen Events, Kamera-Resolver-Hints und minimalen Medienreferenzen auf den bestehenden externen Ingestion-Vertrag.
- Dasselbe gilt fuer weitere direkte Kameraadapter wie Hikvision-IP-Kameras: typische ISAPI-/Analytics-Ereignisse bleiben am aeusseren Rand, werden klein in den bestehenden externen Ingestion-Vertrag uebersetzt und duerfen weder in Recorder-/NVR- noch in Hub-/CMS-Semantik umgebogen werden.
- Hikvision-NVR-/Recorder-Pfade sind separat von Hikvision-IP-Kamera-Pfaden zu behandeln: `sourceType` bleibt recorder-nah, Kamera-Hinweise duerfen nur als Kanal-/Kontextreferenz mitlaufen, und typische NVR-Ereignisse wie Motion, Video Loss, HDD-/Disk-Fehler oder Recorder-/Netzwerkstoerungen werden nur als kleiner Vendor-Adapter auf den bestehenden externen Ingestion-Vertrag gemappt.
