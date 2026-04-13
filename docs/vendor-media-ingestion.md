# Vendor-Media-Ingestion

## Ziel

Die Leitstelle verarbeitet Herstelleralarme und Hersteller-Medien ueber **einen gemeinsamen operativen Kern**:

- Alarmpfad: Vendor-Adapter oder generischer External-Alarm-Ingest
- Medienpfad: generischer External-Media-Ingest
- Aufloesung intern immer auf `site_id` und `component_id`
- Korrelation spaeterer Medien ueber dieselbe interne Alarm-/Fallstruktur

Es gibt keine zweite Geraeteverwaltung, keine vendor-spezifische Admin-App und keine separate Medienplattform neben `alarm-core`.

## Wiederverwendete bestehende Strukturen

- `devices` bleiben fuehrende interne Standort-Komponenten.
- `alarm_source_mappings` bleiben die fachlich pflegbare standortbezogene Quellenzuordnung.
- `alarm_cases`, `alarm_events` und `alarm_media` bleiben die operative Alarm- und Medienbasis.
- `alarm_media.metadata` traegt Bundle- und Vendor-Kontext, statt einen parallelen UI-Datenpfad aufzubauen.

## Neue generische Bausteine

- `apps/backend/src/modules/alarm-core/vendor-profiles.ts`
  - generische Vendor-Profile
  - kanonische Media-Bundle-Profile
- `apps/backend/src/modules/alarm-core/vendor-media-parser.ts`
  - generischer Parser-Dispatch
  - erster konkreter Parser fuer Grundig-Dateinamen/-Pfade
- `apps/backend/src/modules/alarm-core/external-media-ingestion-service.ts`
  - generischer Media-Ingest fuer FTP/SFTP/Upload-Referenzen
  - Duplicate-Erkennung
  - Mapping auf Standort/Komponente
  - Korrelation zu bestehenden Alarmfaellen
- `alarm_media_inbox`
  - persistenter technischer Inbox-/Orphan-/Pending-Zwischenspeicher fuer Upload-Reihenfolge vor/nach Alarm

## Inbox-Monitoring

Fuer operative Transparenz gibt es einen read-only Endpunkt:

- `GET /api/v1/alarm-media-inbox`

Unterstuetzte Query-Parameter:

- `status`
- `limit`
- `siteId`
- `vendor`

Die Rueckgabe zeigt kompakt:

- Inbox-ID
- Status
- Vendor / Source-Type
- Dateiname
- `storageKey`
- `correlationKey`
- geparsten Zeitstempel
- zugeordneten Alarmfall, falls vorhanden
- `createdAt` / `updatedAt`
- Fehlergrund, falls vorhanden

## Fuehrende interne Kennungen

- Standort: `site_id`
- Komponente: `component_id` (`devices.id`)

Externe Vendor-Felder wie `source_id`, `recorder_id`, `channel`, `serial_number` oder `vendor_event_id` dienen nur der Aufloesung und Korrelation.

## Generische Mapping-Felder im Standort

Die standortbezogene Mapping-Pflege nutzt weiterhin `alarm_source_mappings` und wurde um `mediaBundleProfileKey` erweitert.

Wichtige Felder:

- `vendor`
- `sourceType`
- `externalSourceKey`
- `externalDeviceId`
- `externalRecorderId`
- `channelNumber`
- `serialNumber`
- `analyticsName`
- `eventNamespace`
- `mediaBundleProfileKey`
- `componentId`
- `nvrComponentId`

## Media-Bundle-Profile

- `three_images_one_clip`
- `single_snapshot`
- `clip_only`
- `nvr_channel_snapshot_clip`
- `event_without_media`

Grundig nutzt standardmaessig `three_images_one_clip`, kann im Standort-Mapping aber explizit uebersteuert werden.

## Unterstuetzte Media-Dateinamenschemata

### Grundig

- kanonisches Doppel-Unterstrich-Schema mit optionaler `vendor_event_id`

### Dahua

Aktuell bewusst unterstuetzt:

- strukturiert: `<sourceId>__<channelId>__<eventType>__<eventTs>__<vendorEventId>__img_001.jpg`
- legacy-underscore: `<sourceId>_<channelId>_<eventType>_<eventTs>_<vendorEventId>_001.jpg`
- Clip analog mit `clip.mp4`

### Hikvision

Aktuell bewusst unterstuetzt:

- strukturiert: `<sourceId>__<channelId>__<eventType>__<eventTs>__<vendorEventId>__img_001.jpg`
- legacy-underscore: `<sourceId>_<channelId>_<eventType>_<eventTs>_<vendorEventId>_001.jpg`
- Clip analog mit `clip.mp4`

Nicht parsebare Formate werden bewusst als `orphaned` behandelt. Es gibt keine stille Fehlzuordnung.

## Matching-Reihenfolge fuer Vendor-Medien

Die Medienkorrelation arbeitet deterministisch in dieser Reihenfolge:

1. `vendor_event_id` gegen `externalSourceRef`
2. `correlation_key` gegen `technicalDetails.vendorCorrelationKey`
3. `site_id + component_id + event_type + exact event_ts`
4. enger defensiver Zeitkorridor auf derselben Komponente

Nicht aufloesbare Uploads bleiben als `pending` oder `orphaned` in `alarm_media_inbox`.

## Storage-Zielpfad

Der generische Media-Ingest normalisiert Vendor-Medien auf einen kanonischen Storage-Key:

`/alarms/YYYY/MM/KW/DD/<source_id>/<correlation_key>/<filename>`

Beispiel:

`/alarms/2026/04/KW15/11/GR_CAM_014/grundig__camera__GR_CAM_014__CH01__motion__2026-04-11T14:33:21.000Z__EVT88442191/GR_CAM_014__CH01__motion__20260411T143321Z__EVT88442191__img_001.jpg`

Zur produktiven Storage-Anbindung siehe auch `docs/alarm-media-storage.md`.

## Neuen Hersteller ergaenzen

1. Vendor-Profil in `vendor-profiles.ts` ergaenzen.
2. Alarmadapter am Rand normalisieren, nicht im Kernmodell.
3. Optionalen Media-Dateinamenparser in `vendor-media-parser.ts` registrieren.
4. Standort-Mapping ueber bestehende `alarm_source_mappings` pflegen.

So bleibt der Kern generisch und jeder Hersteller haengt sich nur als austauschbare Randschicht an.
