# Axis IP-Kamera Adapter

## Ziel

Der Axis-IP-Kamera-Adapter ist ein konkreter, kleiner Kamera-/Analytics-Integrationspfad ueber der bereits vorhandenen externen Alarm-Ingestion.
Er nimmt Axis-IP-Kamera-nahe Ereignisse an, normalisiert sie in `ExternalAlarmIngestionRequest` und delegiert danach an `POST /api/v1/alarm-ingestion/external`.

Wichtig: Dieser Pfad ist bewusst **kein** Recorder-/NVR-Adapter und **kein** Hub-/CMS-Pfad.

## Eingangspfad

- `POST /api/v1/alarm-ingestion/external/axis/ip-camera`
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

- `sourceSystem = "axis"`
- `sourceType = "camera"`
- `externalEventId = sourceEventId`

Geraete-Hinweise:

1. primaer wird `cameraSerialNumber` genutzt
2. falls keine Seriennummer vorhanden ist, faellt der Adapter auf `cameraIp` zurueck
3. `cameraId` und `siteExternalHint` bleiben bewusst nur Metadaten und werden nicht als Kern-Resolver missbraucht

## Event-Mapping

| Axis-Kamera-Event | Leitstellen-Typ |
| --- | --- |
| `motion`, `videomotion`, `motiondetection`, `axis:motiondetection` | `motion` |
| `linetouched`, `crosslinedetection`, `linecrossing`, `linedetection` | `line_crossing` |
| `intrusion`, `fencedetection`, `areaentry` | `area_entry` |
| `tampering`, `obstruction`, `covering` | `sabotage` |
| `videoloss`, `video_loss` | `video_loss` |
| `networkdisconnected`, `deviceunreachable`, `connectionlost` | `camera_offline` |

Unbekannte Eventtypen:

- werden transparent in `snake_case` umgeformt
- danach der bestehenden externen Ingestion uebergeben
- der Alarmkern entscheidet unveraendert selbst weiter

Severity-Mapping:

- `critical`, `urgent`, `major`, `1` -> `critical`
- `high`, `warning`, `2` -> `high`
- `normal`, `medium`, `low`, `info`, `3` -> `normal`

## Beispielpayload

```json
{
  "sourceEventId": "AXIS-CAM-500",
  "eventCode": "LineTouched",
  "eventType": "CrossLineDetection",
  "eventTime": "2026-04-10T20:30:00.000Z",
  "siteId": "site-hamburg-hafen",
  "siteExternalHint": "HH-HAFEN-AXIS-01",
  "cameraId": "axis-cam-yard-1",
  "cameraName": "Yard Kamera 1",
  "cameraSerialNumber": "AX-1468-001",
  "cameraIp": "10.12.0.21",
  "severity": "warning",
  "zone": "yard-entry",
  "ruleName": "Nordtor Linie",
  "analyticsName": "CrossLineDetection",
  "media": [
    {
      "mediaType": "snapshot",
      "url": "https://example.test/axis-camera-snapshot.jpg",
      "mimeType": "image/jpeg",
      "capturedAt": "2026-04-10T20:30:01.000Z"
    }
  ]
}
```

## Erwartete Normalisierung

```json
{
  "sourceSystem": "axis",
  "sourceType": "camera",
  "externalEventId": "AXIS-CAM-500",
  "siteId": "site-hamburg-hafen",
  "deviceSerialNumber": "AX-1468-001",
  "deviceNetworkAddress": "10.12.0.21",
  "eventType": "line_crossing",
  "eventTime": "2026-04-10T20:30:00.000Z",
  "severity": "high",
  "title": "Axis Camera Yard Kamera 1 | Line Crossing",
  "description": "Analytics CrossLineDetection | Regel Nordtor Linie | Zone yard-entry",
  "zone": "yard-entry",
  "cameraName": "Yard Kamera 1",
  "media": [
    {
      "storageKey": "https://example.test/axis-camera-snapshot.jpg",
      "mediaKind": "snapshot",
      "mimeType": "image/jpeg",
      "capturedAt": "2026-04-10T20:30:01.000Z"
    }
  ]
}
```

Der eigentliche Alarmfall entsteht anschliessend weiterhin ausschliesslich ueber die bestehende externe Ingestion und den unveraenderten `AlarmIngestionService`.

## Bewusste Nicht-Ziele

- keine vollstaendige Axis-Kameraplattformintegration
- keine vollstaendige VAPIX-/ONVIF-/RTSP-/Action-Rule-Abdeckung
- kein universelles Multi-Vendor-Kamera-Framework
- keine neue Medienplattform
- keine Recorder-/NVR- oder Hub-/CMS-Semantik in diesem Pfad
- keine neue Alarm-, Workflow- oder Dispatch-Logik

## Anschluss fuer spaetere Betriebsformen

Spaetere reale Axis-Kamera-Collector oder kameranahe Integrationen koennen denselben Pfad nutzen:

1. kamera-nahe Payloads in dieses kleine Schema uebersetzen
2. an `POST /api/v1/alarm-ingestion/external/axis/ip-camera` oder direkt an denselben Adapter-Service uebergeben
3. Resolver-, Audit-, Duplikat- und Kernlogik unveraendert weiterverwenden

So bleibt die Kamera-/Analytics-Logik am Rand und der Leitstellenkern unveraendert fuehrend.
