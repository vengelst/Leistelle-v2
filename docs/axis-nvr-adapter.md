# Axis NVR Adapter

## Ziel

Der Axis-NVR-Adapter ist ein konkreter, kleiner Recorder-/Video-Integrationspfad ueber der bereits vorhandenen externen Alarm-Ingestion.
Er nimmt Axis-NVR-nahe Ereignisse an, normalisiert sie in `ExternalAlarmIngestionRequest` und delegiert danach an `POST /api/v1/alarm-ingestion/external`.

Wichtig: Dieser Pfad ist bewusst **kein** direkter Kamera-Adapter und **kein** Hub-/CMS-Pfad.

## Eingangspfad

- `POST /api/v1/alarm-ingestion/external/axis/nvr`
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

## Normalisierung in `ExternalAlarmIngestionRequest`

Der Adapter setzt fest:

- `sourceSystem = "axis"`
- `sourceType = "nvr"`
- `externalEventId = sourceEventId`

Geraete-Hinweise:

1. primaer wird `cameraSerialNumber` oder `cameraIp` genutzt
2. falls keine Kamera-Hinweise vorhanden sind, faellt der Adapter auf `nvrSerialNumber` oder `nvrIp` zurueck
3. `nvrId`, `cameraId` und `siteExternalHint` bleiben bewusst Metadaten

## Event-Mapping

| Axis-NVR-Event | Leitstellen-Typ |
| --- | --- |
| `universalMotionDetection`, `forwardedMotion`, `motion`, `videoMotion` | `motion` |
| `videoLoss`, `videoConnectionLost`, `video_loss` | `video_loss` |
| `storageError`, `diskError`, `diskFull`, `recordingFailed`, `recordError` | `technical` |
| `networkLost`, `recorderOffline`, `nvrOffline`, `connectionLost` | `nvr_offline` |
| `remoteDeviceConnectionLost`, `cameraDisconnected`, `channelOffline` | `camera_offline` |
| `tamper`, `tampering` | `sabotage` |

Unbekannte Eventtypen:

- werden transparent in `snake_case` umgeformt
- danach der bestehenden externen Ingestion uebergeben
- der Alarmkern entscheidet unveraendert selbst weiter

## Beispielpayload

```json
{
  "sourceEventId": "AXIS-NVR-500",
  "eventCode": "UniversalMotionDetection",
  "eventType": "ForwardedMotion",
  "eventTime": "2026-04-10T21:30:00.000Z",
  "siteId": "site-hamburg-hafen",
  "siteExternalHint": "HH-HAFEN-AXIS-NVR-01",
  "nvrId": "axis-nvr-hafen-1",
  "nvrName": "Axis Hafen Recorder",
  "nvrSerialNumber": "NVR-820-001",
  "nvrIp": "10.12.0.10",
  "cameraId": "axis-cam-yard-1",
  "cameraName": "Yard Kamera 1",
  "cameraSerialNumber": "AX-1468-001",
  "cameraIp": "10.12.0.21",
  "channel": 1,
  "severity": "warning",
  "zone": "yard-entry",
  "ruleName": "Nordtor Linie",
  "media": [
    {
      "mediaType": "snapshot",
      "url": "https://example.test/axis-nvr-snapshot.jpg",
      "mimeType": "image/jpeg",
      "capturedAt": "2026-04-10T21:30:01.000Z"
    }
  ]
}
```

## Bewusste Nicht-Ziele

- keine vollstaendige Axis-NVR-Plattformintegration
- keine vollstaendige VAPIX-/ONVIF-/RTSP-/Playback-Abdeckung
- kein universelles Multi-Vendor-NVR-Framework
- keine neue Medienplattform
- keine Kamera-only- oder Hub-/CMS-Semantik in diesem Pfad
- keine neue Alarm-, Workflow- oder Dispatch-Logik

## Anschluss fuer spaetere Betriebsformen

Spaetere reale Axis-NVR-Collector oder recordernahe Integrationen koennen denselben Pfad nutzen:

1. recordernahe Payloads in dieses kleine Schema uebersetzen
2. an `POST /api/v1/alarm-ingestion/external/axis/nvr` oder direkt an denselben Adapter-Service uebergeben
3. Resolver-, Audit-, Duplikat- und Kernlogik unveraendert weiterverwenden

So bleibt die Recorderlogik am Rand und der Leitstellenkern unveraendert fuehrend.
