# Externe Alarm-Ingestion

## Ziel

Die externe Alarm-Ingestion ist ein schmaler Adapterrand vor dem bestehenden `alarm-core`.
Externe Quellen liefern Ereignisse, die in das vorhandene interne Alarm-Ingestion-Modell normalisiert werden.
Reservierung, Bewertung, Abschluss, Archiv, Reporting, Medienzugriff und Auto-Zuordnung bleiben unveraendert in den bestehenden Modulen.

## Eingangspfad

- `POST /api/v1/alarm-ingestion/external`
- optional abgesichert ueber Header `x-alarm-ingestion-key`
- das erwartete Secret kommt aus `ALARM_EXTERNAL_INGESTION_SHARED_SECRET`
- ist kein Secret konfiguriert, bleibt der Pfad bewusst offen wie der bestehende generische Ingestion-Pfad

Aktuell darauf aufbauender konkreter Herstellerpfad:

- `POST /api/v1/alarm-ingestion/external/dahua/nvr`
- dieser normalisiert Dahua-/NVR-Payloads zuerst in das unten beschriebene Schema und delegiert dann an den generischen externen Ingestion-Pfad
- `POST /api/v1/alarm-ingestion/external/grundig/gu-rn-ac5104n`
- dieser normalisiert Grundig-/Recorder-Payloads fuer den `GU-RN-AC5104N` zuerst in das unten beschriebene Schema und delegiert dann an den generischen externen Ingestion-Pfad
- `POST /api/v1/alarm-ingestion/external/ajax/hub2-4g-jeweller`
- dieser normalisiert AJAX-Hub-/Cloud-nahe Ereignisse zuerst in das unten beschriebene Schema und delegiert dann an den generischen externen Ingestion-Pfad
- `POST /api/v1/alarm-ingestion/external/ajax/cloud-cms-stub`
- dieser ist ein sehr duenner Collector-Stub fuer Ajax-Cloud-/CMS-nahe Eingangspayloads, normalisiert minimal in das vorhandene AJAX-Hub-Schema und delegiert dann an den bestehenden AJAX-Hub-Adapter
- `POST /api/v1/alarm-ingestion/external/ajax/nvr-8ch`
- dieser ist ein kleiner recorder-/video-naher Adapter fuer AJAX NVR (8ch), normalisiert minimal in das bestehende externe Ingestion-Schema und delegiert dann an den generischen externen Ingestion-Pfad
- `POST /api/v1/alarm-ingestion/external/grundig/gu-series/ip-camera`
- dieser ist ein kleiner kamera-/analytics-naher Adapter fuer Grundig-GU-Serie-IP-Kameras, normalisiert minimal in das bestehende externe Ingestion-Schema und delegiert dann an den generischen externen Ingestion-Pfad
- `POST /api/v1/alarm-ingestion/external/axis/ip-camera`
- dieser ist ein kleiner kamera-/analytics-naher Adapter fuer Axis-IP-Kameras, normalisiert minimal in das bestehende externe Ingestion-Schema und delegiert dann an den generischen externen Ingestion-Pfad
- `POST /api/v1/alarm-ingestion/external/axis/nvr`
- dieser ist ein kleiner recorder-/video-naher Adapter fuer Axis-NVRs, normalisiert minimal in das bestehende externe Ingestion-Schema und delegiert dann an den generischen externen Ingestion-Pfad
- `POST /api/v1/alarm-ingestion/external/uniview/ip-camera`
- dieser ist ein kleiner kamera-/analytics-naher Adapter fuer Uniview-/UNV-IP-Kameras, normalisiert minimal in das bestehende externe Ingestion-Schema und delegiert dann an den generischen externen Ingestion-Pfad
- `POST /api/v1/alarm-ingestion/external/hikvision/ip-camera`
- dieser ist ein kleiner kamera-/analytics-naher Adapter fuer Hikvision-IP-Kameras, normalisiert minimal in das bestehende externe Ingestion-Schema und delegiert dann an den generischen externen Ingestion-Pfad
- `POST /api/v1/alarm-ingestion/external/hikvision/nvr`
- dieser ist ein kleiner recorder-/video-naher Adapter fuer Hikvision-NVRs, normalisiert minimal in das bestehende externe Ingestion-Schema und delegiert dann an den generischen externen Ingestion-Pfad

## Minimales Integrationsschema

Pflichtfelder:

- `sourceSystem`
- `sourceType`
- `externalEventId`
- `eventType`
- `eventTime`

Optionale Zuordnung:

- `siteId`
- `deviceId`
- `deviceSerialNumber`
- `deviceNetworkAddress`

Optionale Kontextfelder:

- `severity`
- `title`
- `description`
- `zone`
- `cameraName`
- `rawPayload`
- `media[]`

`media[]` nutzt bewusst nur bestehende Alarm-Medienreferenzen:

- `storageKey`
- `mediaKind`
- `mimeType`
- `capturedAt`
- `isPrimary`
- `metadata`
- optional dieselben Device-Hinweise wie das Hauptereignis

## Zuordnung und Normalisierung

Die Adapter-Schicht loest zuerst die technische Zuordnung auf und delegiert dann an die bestehende `AlarmIngestionService.ingest(...)`.

Regeln:

1. `externalSourceRef` wird kanonisch als `sourceSystem:sourceType:externalEventId` gebildet.
2. Wenn `deviceId` vorhanden ist, wird dieses direkt verwendet.
3. Sonst wird ueber `deviceSerialNumber` oder `deviceNetworkAddress` auf ein vorhandenes Device aufgeloest.
4. `siteId` wird direkt verwendet, falls vorhanden.
5. Falls kein `siteId` mitgegeben wird, wird der Standort aus dem aufgeloesten Device abgeleitet.
6. Medienreferenzen werden auf die bestehende Alarm-Medienstruktur abgebildet; dabei werden nur Referenzen und Metadaten uebernommen.
7. `eventType` und `severity` werden nur technisch normalisiert und anschliessend an die bestehende Alarm-Ingestion uebergeben.

## Fehler- und Duplikatverhalten

- Unbekannter `siteId`: `404 ALARM_EXTERNAL_SITE_NOT_FOUND`
- Fehlender Standort ohne aufloesbares Device: `400 ALARM_EXTERNAL_SITE_REQUIRED`
- Unbekanntes `deviceId`: `404 ALARM_EXTERNAL_DEVICE_NOT_FOUND`
- Unbekannte `deviceSerialNumber`: `404 ALARM_EXTERNAL_DEVICE_SERIAL_NOT_FOUND`
- Unbekannte `deviceNetworkAddress`: `404 ALARM_EXTERNAL_DEVICE_ADDRESS_NOT_FOUND`
- Device ohne Standortbezug: `409 ALARM_EXTERNAL_DEVICE_SITE_MISSING`
- Device/Standort-Widerspruch: `409 ALARM_EXTERNAL_SITE_DEVICE_MISMATCH`
- Mehrdeutige Device-Aufloesung ueber Seriennummer oder Netzwerkadresse: `409 ALARM_DEVICE_LOOKUP_AMBIGUOUS`
- Ungueltiger Payload: bestehende Request-Validation mit `400`

Duplikate:

- Die Schicht behandelt `sourceSystem:sourceType:externalEventId` idempotent.
- Existiert bereits ein Alarmfall mit derselben `externalSourceRef`, wird kein neuer Fall erzeugt.
- Der Endpoint antwortet dann mit `duplicate: true` und dem bereits vorhandenen Alarmfallkontext.

## Audit und Nachvollziehbarkeit

Zusatzlich zur bestehenden Alarm-Ingestion werden externe Eingriffe separat nachvollziehbar gemacht:

- `alarm.external_ingestion.accepted`
- `alarm.external_ingestion.duplicate`
- Ablehnungen laufen weiter ueber den bestehenden Fehler-Auditpfad unter `/api/v1/alarm-ingestion*`

Im Alarmfall selbst wird ein zusaetzliches `payload_updated`-Event mit den Mapping-Informationen abgelegt.

## Bewusste Nicht-Ziele

- keine Herstellerplattform
- keine universelle Event-Bus- oder Integrationsplattform
- keine neue Medienpipeline
- keine neue Monitoring-Welt
- keine Event-Korrelation oder Alarmzusammenfuehrung
- keine automatische Discovery von Standorten oder Devices
- keine neue Leitstellen-Fachlogik neben `alarm-core`

## Anschluss fuer spaetere Adapter

Spaetere Adapter, z. B. fuer Dahua, NVR-Gateways oder EMA-Controller, sollen:

1. ihr Quellformat am Rand auf dieses minimale Schema normalisieren
2. interne Standort-/Device-Referenzen vorab oder ueber bestehende technische Kennungen aufloesen
3. anschliessend nur noch `POST /api/v1/alarm-ingestion/external` bedienen

So bleibt die Herstellerlogik ausserhalb der fachlichen Leitstellenkernlogik.

Fuer AJAX-Cloud-/CMS-nahe spaetere Betriebsformen gilt zusaetzlich:

1. ein Collector darf vor dem vorhandenen AJAX-Hub-Adapter sitzen
2. dieser Collector normalisiert nur minimal in das freigegebene AJAX-Hub-Eingangsmodell
3. Shared Secret, Audit, Duplikat- und Kernlogik bleiben unveraendert auf den bestehenden AJAX-Hub- und externen Ingestion-Pfaden
