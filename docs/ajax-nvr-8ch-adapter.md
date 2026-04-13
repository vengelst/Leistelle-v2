# AJAX NVR (8ch) Adapter

## Ziel

Der AJAX-NVR-Adapter ist ein konkreter, kleiner Recorder-/Video-Integrationspfad ueber der bereits vorhandenen externen Alarm-Ingestion.
Er nimmt AJAX-NVR-(8ch)-nahe Ereignisse an, normalisiert sie in `ExternalAlarmIngestionRequest` und delegiert danach an `POST /api/v1/alarm-ingestion/external`.

Wichtig: Dieser Pfad ist bewusst **kein** Hub-/Jeweller-/CMS-Adapter.

## Eingangspfad

- `POST /api/v1/alarm-ingestion/external/ajax/nvr-8ch`
- Shared Secret wie bei der bestehenden externen Ingestion ueber `x-alarm-ingestion-key`
- gleiche Backend-Konfiguration ueber `ALARM_EXTERNAL_INGESTION_SHARED_SECRET`

## Minimales vendor-nahes Schema

Pflichtfelder:

- `sourceEventId`
- `eventCode`
- `eventTime`

Optionale Recorder-/Kamera-/Standorthinweise:

- `eventType`
- `siteId`
- `siteExternalHint`
- `nvrId`
- `nvrName`
- `nvrSerialNumber`
- `nvrIp`
- `cameraId`
- `cameraName`
- `cameraSerialNumber`
- `cameraIp`
- `channel`

Optionale Kontextfelder:

- `severity`
- `zone`
- `ruleName`
- `description`
- `rawPayload`

Optionale Medienreferenzen:

- `media[]`
- pro Eintrag: `mediaType`, `url`, `mimeType`, `capturedAt`, `cameraSerialNumber`, `cameraIp`, `metadata`

## Beispielpayloads

Beispiel `motion`:

```json
{
  "sourceEventId": "AJAX-NVR-500",
  "eventCode": "Motion",
  "eventType": "video_motion",
  "eventTime": "2026-04-10T16:30:00.000Z",
  "siteId": "site-hamburg-hafen",
  "nvrName": "Ajax Hafen Recorder",
  "nvrSerialNumber": "NVR-820-001",
  "cameraName": "Yard Kamera 1",
  "cameraSerialNumber": "AX-1468-001",
  "channel": 1,
  "severity": "warning",
  "zone": "yard-north",
  "ruleName": "Motion North",
  "media": [
    {
      "mediaType": "snapshot",
      "url": "https://example.test/ajax-nvr-snapshot.jpg",
      "mimeType": "image/jpeg",
      "capturedAt": "2026-04-10T16:30:01.000Z"
    }
  ]
}
```

Beispiel `video_loss`:

```json
{
  "sourceEventId": "AJAX-NVR-501",
  "eventCode": "VideoLoss",
  "eventTime": "2026-04-10T16:40:00.000Z",
  "siteId": "site-hamburg-hafen",
  "nvrName": "Ajax Hafen Recorder",
  "nvrSerialNumber": "NVR-820-001",
  "cameraName": "Yard Kamera 1",
  "cameraSerialNumber": "AX-1468-001",
  "channel": 1,
  "severity": "major",
  "description": "Videostream der Kamera ist abgerissen",
  "media": [
    {
      "mediaType": "archive_reference",
      "url": "https://example.test/ajax-nvr/archive/segment-1",
      "metadata": {
        "archiveSegment": "segment-1"
      }
    }
  ]
}
```

## Normalisierung in `ExternalAlarmIngestionRequest`

Der Adapter setzt fest:

- `sourceSystem = "ajax"`
- `sourceType = "nvr"`
- `externalEventId = sourceEventId`

Geraete-Hinweise:

1. primaer wird `cameraSerialNumber` oder `cameraIp` genutzt
2. falls keine Kamera-Hinweise vorhanden sind, faellt der Adapter auf `nvrSerialNumber` oder `nvrIp` zurueck
3. `siteId` wird direkt weitergereicht, `siteExternalHint` bleibt nur als Metadatum

Bewusst unterstuetzte Eventtypen:

- `motion`, `motion_detected`, `video_motion`, `motion_alarm` -> `motion`
- `intrusion`, `intrusion_alarm`, `perimeter_intrusion`, `zone_enter` -> `area_entry`
- `line_crossing`, `tripwire` -> `line_crossing`
- `tamper`, `enclosure_open`, `cover_open` -> `sabotage`
- `video_loss`, `stream_lost`, `no_video_signal` -> `video_loss`
- `camera_offline`, `channel_offline` -> `camera_offline`
- `nvr_offline`, `recorder_offline` -> `nvr_offline`

Unbekannte Eventtypen:

- werden transparent in `snake_case` umgeformt
- danach der bestehenden externen Ingestion uebergeben
- der Alarmkern entscheidet unveraendert selbst weiter

Severity-Mapping:

- `critical`, `major`, `high`, `1` -> `critical`
- `warning`, `medium`, `2` -> `high`
- `normal`, `low`, `info`, `3` -> `normal`

## Medienreferenzen

AJAX-NVR-Medien werden nur minimal referenziert:

- `snapshot` -> `snapshot`
- `clip` -> `clip`
- `archive_reference` -> `document`

Es gibt bewusst:

- keine Medienproxy-Strecke
- keine Streaming-Plattform
- keine neue Archiv- oder Video-Wall-Logik

## Fehler- und Duplikatverhalten

Der Adapter erfindet keine eigenen Regeln, sondern baut auf der bestehenden externen Ingestion auf:

- Request-Validation-Fehler -> `400`
- unbekannter Standort oder unbekanntes Device -> bestehende externe Fehlercodes
- Shared-Secret-Fehler -> bestehende externe Fehlercodes
- Duplikate laufen ueber dieselbe `externalSourceRef`-Idempotenz:
  `ajax:nvr:<sourceEventId>`

## Bewusste Nicht-Ziele

- keine vollstaendige Ajax-Video-/ONVIF-/RTSP-Plattform
- keine neue Herstellerplattform
- keine neue Medienverarbeitung
- keine Hub-/Jeweller-/CMS-Semantik in diesem Pfad
- keine neue Alarm-, Workflow- oder Dispatch-Logik
- keine Event-Korrelation oder automatische Szenario-Engine

## Anschluss fuer spaetere Betriebsformen

Spaetere reale AJAX-NVR-/Video-/ONVIF-Collector koennen denselben Pfad nutzen:

1. recorder-nahe Payloads in dieses kleine Schema uebersetzen
2. an `POST /api/v1/alarm-ingestion/external/ajax/nvr-8ch` oder direkt an denselben Adapter-Service uebergeben
3. Resolver-, Audit-, Duplikat- und Kernlogik unveraendert weiterverwenden

So bleibt die Recorderlogik am Rand und der Leitstellenkern unveraendert fuehrend.
