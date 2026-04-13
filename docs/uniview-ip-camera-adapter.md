# Uniview / UNV IP-Kamera Adapter

## Ziel

Der Uniview-/UNV-IP-Kamera-Adapter ist ein konkreter, kleiner Kamera-/Analytics-Integrationspfad ueber der bereits vorhandenen externen Alarm-Ingestion.
Er nimmt Uniview-/UNV-IP-Kamera-nahe Ereignisse an, normalisiert sie in `ExternalAlarmIngestionRequest` und delegiert danach an `POST /api/v1/alarm-ingestion/external`.

Wichtig: Dieser Pfad ist bewusst **kein** Recorder-/NVR-Adapter und **kein** Hub-/CMS-Pfad.

## Eingangspfad

- `POST /api/v1/alarm-ingestion/external/uniview/ip-camera`
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

- `sourceSystem = "uniview"`
- `sourceType = "camera"`
- `externalEventId = sourceEventId`

Geraete-Hinweise:

1. primaer wird `cameraSerialNumber` genutzt
2. falls keine Seriennummer vorhanden ist, faellt der Adapter auf `cameraIp` zurueck
3. `cameraId` und `siteExternalHint` bleiben bewusst nur Metadaten und werden nicht als Kern-Resolver missbraucht

## Event-Mapping

| Uniview-/UNV-Kamera-Event | Leitstellen-Typ |
| --- | --- |
| `motion`, `videomotion`, `motiondetection` | `motion` |
| `linecrossing`, `line_crossing`, `crosslinedetection`, `crossline` | `line_crossing` |
| `intrusion`, `intrusiondetection`, `enterarea`, `areaentry`, `regionalintrusion` | `area_entry` |
| `tamper`, `tampering`, `coveralarm`, `obstruction`, `covering`, `shelteralarm` | `sabotage` |
| `videoloss`, `video_loss` | `video_loss` |
| `networkdisconnected`, `deviceoffline`, `deviceunreachable`, `networkabnormal`, `ipconflict`, `connectionlost` | `camera_offline` |

Unbekannte Eventtypen:

- werden transparent in `snake_case` umgeformt
- danach der bestehenden externen Ingestion uebergeben
- der Alarmkern entscheidet unveraendert selbst weiter

## Beispielpayload

```json
{
  "sourceEventId": "UNV-CAM-500",
  "eventCode": "CrossLineDetection",
  "eventType": "LineCrossing",
  "eventTime": "2026-04-10T22:30:00.000Z",
  "siteId": "site-hamburg-hafen",
  "siteExternalHint": "HH-HAFEN-UNV-01",
  "cameraId": "unv-cam-yard-1",
  "cameraName": "Yard Kamera 1",
  "cameraSerialNumber": "AX-1468-001",
  "cameraIp": "10.12.0.21",
  "severity": "warning",
  "zone": "yard-entry",
  "ruleName": "Nordtor Linie",
  "analyticsName": "Cross Line Detection",
  "media": [
    {
      "mediaType": "snapshot",
      "url": "https://example.test/uniview-camera-snapshot.jpg",
      "mimeType": "image/jpeg",
      "capturedAt": "2026-04-10T22:30:01.000Z"
    }
  ]
}
```

## Bewusste Nicht-Ziele

- keine vollstaendige Uniview-/UNV-Kameraplattformintegration
- keine vollstaendige ONVIF-/RTSP-/VCA-/CMS-Abdeckung
- kein universelles Multi-Vendor-Kamera-Framework
- keine neue Medienplattform
- keine Recorder-/NVR- oder Hub-/CMS-Semantik in diesem Pfad
- keine neue Alarm-, Workflow- oder Dispatch-Logik

## Anschluss fuer spaetere Betriebsformen

Spaetere reale Uniview-/UNV-Kamera-Collector oder kameranahe Integrationen koennen denselben Pfad nutzen:

1. kamera-nahe Payloads in dieses kleine Schema uebersetzen
2. an `POST /api/v1/alarm-ingestion/external/uniview/ip-camera` oder direkt an denselben Adapter-Service uebergeben
3. Resolver-, Audit-, Duplikat- und Kernlogik unveraendert weiterverwenden

So bleibt die Kamera-/Analytics-Logik am Rand und der Leitstellenkern unveraendert fuehrend.
