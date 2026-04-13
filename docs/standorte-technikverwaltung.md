# Standorte mit Technikverwaltung

## Ziel

Der Hauptmenuepunkt `Standorte` bildet den administrativen Pflegebereich fuer:

- Standorte
- zugeordnete Technik
- Netzwerkbezug
- Audio/Lautsprecher
- vorbereitete Alarmquellen-Zuordnung

Die Pflege bleibt bewusst getrennt von:

- Leitstellen-Hauptscreen
- Operator-Screen
- Wallboard
- aktiver Alarmbearbeitung

## Wiederverwendete bestehende Strukturen

Die Umsetzung baut auf dem vorhandenen `master-data`-Pfad auf und fuehrt keine Parallelwelt ein.

- Frontend-Workspace: `apps/frontend/src/views/app.ts`
- Standort-Workspace/View: `apps/frontend/src/views/master-data.ts`
- Frontend-Handler: `apps/frontend/src/actions/master-data-handlers.ts`, `apps/frontend/src/handlers/site.handlers.ts`
- Contracts: `packages/contracts/src/master-data.ts`
- Backend-Service/Store: `apps/backend/src/modules/master-data/service.ts`, `apps/backend/src/modules/master-data/store.ts`
- HTTP-Routen: bestehende `master-data`-Routen unter `/api/v1/master-data/*`

## Seitenstruktur im Menuepunkt `Standorte`

Der bestehende Workspace `sites` wurde ausgebaut zu:

- Standortliste mit Suche und Statusfilter
- selektierter Standortdetailansicht
- Bereichsnavigation:
  - `Uebersicht`
  - `Technik`
  - `Netzwerk`
  - `Audio`
  - `Alarmquellen`
  - `Historie`

## Standort-Stammdaten

Ergaenzte Standortfelder:

- `internalReference`
- `description`
- `houseNumber`
- `siteType`
- `contactPerson`
- `contactPhone`
- `notes`
- bestehende Geo-Koordinaten bleiben erhalten

## Technikverwaltung

Die bestehende Geraetestruktur wurde erweitert, statt neue Entitaeten einzufuehren.

Gemeinsame Felder:

- Name
- Typ
- Hersteller
- Modell
- Seriennummer
- externe Geraete-ID
- IP-/Netzwerkadresse
- MAC-Adresse
- aktiv / inaktiv
- Status

Ergaenzte Zuordnungs- und Technikfelder:

- `linkedNvrDeviceId`
- `channelNumber`
- `zone`
- `viewingDirection`
- `mountLocation`
- `analyticsName`
- `ruleName`
- `storageLabel`
- `wanIp`
- `lanIp`
- `vpnType`
- `provider`
- `simIdentifier`
- `audioZone`
- `supportsPaging`

## Geraetearten

Aktuell werden im UI gezielt gefuehrt:

- Kamera
- NVR
- Router
- Lautsprecher

Die bestehenden Contract-Typen bleiben erhalten; Kamera-Varianten wie `dome_ptz_camera` und `bi_spectral_camera` bleiben kompatibel.

## Alarmquellen-Vorbereitung

Der Bereich `Alarmquellen` zeigt die zentralen Matching-Felder fuer spaetere technische Alarmzuordnung:

- Hersteller
- Geraetetyp
- Seriennummer
- IP-Adresse
- externe Geraete-ID
- Kanal
- NVR-Zuordnung
- Standortzuordnung

Damit bleibt die Alarm-Ingestion weiterhin in den Vendor-Adaptern, waehrend die referenzierbaren Stammdaten im Standortbereich gepflegt werden.

## Rechte

Es wird das bestehende Rollenmodell wiederverwendet:

- Lesen: bestehende Session-basierte Sicht auf `master-data`
- Schreiben: nur `administrator` und `leitstellenleiter`

Es wurde kein neues RBAC-System eingefuehrt.
