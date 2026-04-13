# Grundig GU-Serie IP-Kamera Adapter

## Ziel

Der Grundig-GU-Kamera-Adapter ist ein konkreter, kleiner Kamera-/Analytics-Integrationspfad ueber der bereits vorhandenen externen Alarm-Ingestion.
Er nimmt Grundig-GU-Serie-IP-Kamera-nahe Ereignisse an, normalisiert sie in `ExternalAlarmIngestionRequest` und delegiert danach an `POST /api/v1/alarm-ingestion/external`.

Wichtig: Dieser Pfad ist bewusst **kein** Recorder-/NVR-Adapter und **kein** Hub-/CMS-Pfad.

## Eingangspfad

- `POST /api/v1/alarm-ingestion/external/grundig/gu-series/ip-camera`
- Shared Secret wie bei der bestehenden externen Ingestion ueber `x-alarm-ingestion-key`
- gleiche Backend-Konfiguration ueber `ALARM_EXTERNAL_INGESTION_SHARED_SECRET`

## Minimales vendor-nahes Schema

Pflichtfelder:

- `sourceEventId`
- `eventCode`
- `eventTime`

Optionale Kamera-/Standorthinweise:

- `eventType`
- `siteId`
- `siteExternalHint`
- `cameraId`
- `cameraName`
- `cameraSerialNumber`
- `cameraIp`

Optionale Kontextfelder:

- `severity`
- `zone`
- `ruleName`
- `analyticsName`
- `description`
- `rawPayload`

Optionale Medienreferenzen:

- `media[]`
- pro Eintrag: `mediaType`, `url`, `mimeType`, `capturedAt`, `cameraSerialNumber`, `cameraIp`, `metadata`

## Normalisierung in `ExternalAlarmIngestionRequest`

Der Adapter setzt fest:

- `sourceSystem = "grundig"`
- `sourceType = "camera"`
- `externalEventId = sourceEventId`

Geraete-Hinweise:

1. primaer wird `cameraSerialNumber` genutzt
2. falls keine Seriennummer vorhanden ist, faellt der Adapter auf `cameraIp` zurueck
3. `cameraId` und `siteExternalHint` bleiben bewusst nur Metadaten und werden nicht als Kern-Resolver missbraucht

Bewusst unterstuetzte Eventtypen:

- `motion`, `motiondetect`, `motion_detection` -> `motion`
- `linecrossing`, `linecrossingdetection`, `line_crossing`, `tripwire` -> `line_crossing`
- `intrusion`, `intrusiondetection`, `intrusion_detection`, `perimeterintrusiondetection` -> `area_entry`
- `videotampering`, `videotamperingdetection`, `tamper` -> `sabotage`
- `videoloss`, `video_loss` -> `video_loss`
- `networkdisconnected`, `network_disconnected`, `ipaddressconflicted`, `ip_address_conflicted` -> `camera_offline`

Unbekannte Eventtypen:

- werden transparent in `snake_case` umgeformt
- danach der bestehenden externen Ingestion uebergeben
- der Alarmkern entscheidet unveraendert selbst weiter

Severity-Mapping:

- `critical`, `urgent`, `major`, `1` -> `critical`
- `high`, `warning`, `2` -> `high`
- `normal`, `medium`, `low`, `info`, `3` -> `normal`

## Medienreferenzen

Grundig-Kamera-Medien werden nur minimal referenziert:

- `snapshot` -> `snapshot`
- `clip` -> `clip`

Es gibt bewusst:

- keine Medienproxy-Strecke
- keine Transkodierung
- keine neue Kameraplattform

## Fehler- und Duplikatverhalten

Der Adapter erfindet keine eigenen Regeln, sondern baut auf der bestehenden externen Ingestion auf:

- Request-Validation-Fehler -> `400`
- unbekannter Standort oder unbekanntes Device -> bestehende externe Fehlercodes
- Shared-Secret-Fehler -> bestehende externe Fehlercodes
- Duplikate laufen ueber dieselbe `externalSourceRef`-Idempotenz:
  `grundig:camera:<sourceEventId>`

## Beispielpayloads

Beispiel `motion`:

```json
{
  "sourceEventId": "GRUNDIG-CAM-499",
  "eventCode": "MotionDetect",
  "eventType": "motion_detection",
  "eventTime": "2026-04-10T17:20:00.000Z",
  "siteId": "site-hamburg-hafen",
  "cameraName": "Yard Kamera 1",
  "cameraSerialNumber": "AX-1468-001",
  "cameraIp": "10.12.0.21",
  "severity": "warning",
  "zone": "yard-north",
  "ruleName": "Bewegung Nord",
  "analyticsName": "Motion Detection",
  "media": [
    {
      "mediaType": "snapshot",
      "url": "https://example.test/grundig-camera-motion.jpg",
      "mimeType": "image/jpeg",
      "capturedAt": "2026-04-10T17:20:01.000Z"
    }
  ]
}
```

Beispiel `line_crossing`:

```json
{
  "sourceEventId": "GRUNDIG-CAM-500",
  "eventCode": "LineCrossingDetection",
  "eventType": "line_crossing",
  "eventTime": "2026-04-10T17:30:00.000Z",
  "siteId": "site-hamburg-hafen",
  "cameraName": "Yard Kamera 1",
  "cameraSerialNumber": "AX-1468-001",
  "cameraIp": "10.12.0.21",
  "severity": "warning",
  "zone": "yard-entry",
  "ruleName": "Nordtor Linie",
  "analyticsName": "Line Crossing",
  "media": [
    {
      "mediaType": "snapshot",
      "url": "https://example.test/grundig-camera-snapshot.jpg",
      "mimeType": "image/jpeg",
      "capturedAt": "2026-04-10T17:30:01.000Z"
    }
  ]
}
```

Beispiel `video_loss`:

```json
{
  "sourceEventId": "GRUNDIG-CAM-501",
  "eventCode": "VideoLoss",
  "eventTime": "2026-04-10T17:40:00.000Z",
  "siteId": "site-hamburg-hafen",
  "cameraName": "Yard Kamera 1",
  "cameraSerialNumber": "AX-1468-001",
  "cameraIp": "10.12.0.21",
  "severity": "major",
  "description": "Videostream der Kamera ist abgerissen",
  "media": [
    {
      "mediaType": "clip",
      "url": "https://example.test/grundig-camera-clip.mp4",
      "mimeType": "video/mp4"
    }
  ]
}
```

## Erwartete Normalisierung

Aus dem `motion`-Beispiel wird erwartbar ein `ExternalAlarmIngestionRequest` in dieser Form:

```json
{
  "sourceSystem": "grundig",
  "sourceType": "camera",
  "externalEventId": "GRUNDIG-CAM-499",
  "siteId": "site-hamburg-hafen",
  "deviceSerialNumber": "AX-1468-001",
  "deviceNetworkAddress": "10.12.0.21",
  "eventType": "motion",
  "eventTime": "2026-04-10T17:20:00.000Z",
  "severity": "high",
  "title": "Grundig Camera Yard Kamera 1 | Motion",
  "description": "Analytics Motion Detection | Regel Bewegung Nord | Zone yard-north",
  "zone": "yard-north",
  "cameraName": "Yard Kamera 1",
  "media": [
    {
      "storageKey": "https://example.test/grundig-camera-motion.jpg",
      "mediaKind": "snapshot",
      "mimeType": "image/jpeg",
      "capturedAt": "2026-04-10T17:20:01.000Z"
    }
  ]
}
```

Aus dem `line_crossing`-Beispiel wird erwartbar:

```json
{
  "sourceSystem": "grundig",
  "sourceType": "camera",
  "externalEventId": "GRUNDIG-CAM-500",
  "siteId": "site-hamburg-hafen",
  "deviceSerialNumber": "AX-1468-001",
  "deviceNetworkAddress": "10.12.0.21",
  "eventType": "line_crossing",
  "eventTime": "2026-04-10T17:30:00.000Z",
  "severity": "high",
  "title": "Grundig Camera Yard Kamera 1 | Line Crossing",
  "description": "Analytics Line Crossing | Regel Nordtor Linie | Zone yard-entry",
  "zone": "yard-entry",
  "cameraName": "Yard Kamera 1",
  "media": [
    {
      "storageKey": "https://example.test/grundig-camera-snapshot.jpg",
      "mediaKind": "snapshot",
      "mimeType": "image/jpeg",
      "capturedAt": "2026-04-10T17:30:01.000Z"
    }
  ]
}
```

Aus dem `video_loss`-Beispiel wird erwartbar:

```json
{
  "sourceSystem": "grundig",
  "sourceType": "camera",
  "externalEventId": "GRUNDIG-CAM-501",
  "siteId": "site-hamburg-hafen",
  "deviceSerialNumber": "AX-1468-001",
  "deviceNetworkAddress": "10.12.0.21",
  "eventType": "video_loss",
  "eventTime": "2026-04-10T17:40:00.000Z",
  "severity": "critical",
  "title": "Grundig Camera Yard Kamera 1 | Video Loss",
  "description": "Videostream der Kamera ist abgerissen",
  "cameraName": "Yard Kamera 1",
  "media": [
    {
      "storageKey": "https://example.test/grundig-camera-clip.mp4",
      "mediaKind": "clip",
      "mimeType": "video/mp4"
    }
  ]
}
```

Der eigentliche Alarmfall entsteht anschliessend weiterhin ausschliesslich ueber die bestehende externe Ingestion und den unveraenderten `AlarmIngestionService`.

## Bewusste Nicht-Ziele

- keine vollstaendige Grundig-Kameraplattformintegration
- keine vollstaendige CGI-/ONVIF-/FTP-/E-Mail-/RTSP-Abdeckung
- kein universelles Multi-Vendor-Kamera-Framework
- keine neue Medienplattform
- keine Recorder-/NVR- oder Hub-/CMS-Semantik in diesem Pfad
- keine neue Alarm-, Workflow- oder Dispatch-Logik

## Anschluss fuer spaetere Betriebsformen

Spaetere reale Grundig-Kamera-Collector oder kameranahe Integrationen koennen denselben Pfad nutzen:

1. kamera-nahe Payloads in dieses kleine Schema uebersetzen
2. an `POST /api/v1/alarm-ingestion/external/grundig/gu-series/ip-camera` oder direkt an denselben Adapter-Service uebergeben
3. Resolver-, Audit-, Duplikat- und Kernlogik unveraendert weiterverwenden

So bleibt die Kamera-/Analytics-Logik am Rand und der Leitstellenkern unveraendert fuehrend.
