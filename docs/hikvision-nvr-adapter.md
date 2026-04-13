# Hikvision NVR Adapter

## Ziel

Der Hikvision-NVR-Adapter ist ein konkreter, kleiner Recorder-/Video-Integrationspfad ueber der bereits vorhandenen externen Alarm-Ingestion.
Er nimmt Hikvision-NVR-nahe Ereignisse an, normalisiert sie in `ExternalAlarmIngestionRequest` und delegiert danach an `POST /api/v1/alarm-ingestion/external`.

Wichtig: Dieser Pfad ist bewusst **kein** direkter Kamera-Adapter und **kein** Hub-/CMS-Pfad.

## Eingangspfad

- `POST /api/v1/alarm-ingestion/external/hikvision/nvr`
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

- `sourceSystem = "hikvision"`
- `sourceType = "nvr"`
- `externalEventId = sourceEventId`

Geraete-Hinweise:

1. primaer wird `cameraSerialNumber` oder `cameraIp` genutzt
2. falls keine Kamera-Hinweise vorhanden sind, faellt der Adapter auf `nvrSerialNumber` oder `nvrIp` zurueck
3. `nvrId`, `cameraId` und `siteExternalHint` bleiben bewusst Metadaten

## Event-Mapping

| Hikvision-NVR-Event | Leitstellen-Typ |
| --- | --- |
| `videomotion`, `motion`, `motiondetection` | `motion` |
| `videoloss`, `videolost` | `video_loss` |
| `tamper`, `shelteralarm` | `sabotage` |
| `hdError`, `diskError`, `hdFull`, `diskFull`, `recordError`, `videoException` | `technical` |
| `netBroken`, `nvrOffline`, `ipConflict`, `ipAddressConflicted` | `nvr_offline` |
| `ipcDisconnect`, `channelOffline` | `camera_offline` |

Unbekannte Eventtypen:

- werden transparent in `snake_case` umgeformt
- danach der bestehenden externen Ingestion uebergeben
- der Alarmkern entscheidet unveraendert selbst weiter

## Beispielpayload

```json
{
  "sourceEventId": "HIK-NVR-500",
  "eventCode": "VideoMotion",
  "eventType": "motionDetection",
  "eventTime": "2026-04-10T19:30:00.000Z",
  "siteId": "site-hamburg-hafen",
  "nvrName": "Hikvision Hafen Recorder",
  "nvrSerialNumber": "NVR-820-001",
  "cameraName": "Yard Kamera 1",
  "cameraSerialNumber": "AX-1468-001",
  "channel": 1,
  "severity": "warning",
  "zone": "yard-entry",
  "ruleName": "Nordtor Linie",
  "media": [
    {
      "mediaType": "snapshot",
      "url": "https://example.test/hikvision-nvr-snapshot.jpg",
      "mimeType": "image/jpeg",
      "capturedAt": "2026-04-10T19:30:01.000Z"
    }
  ]
}
```

## Bewusste Nicht-Ziele

- keine vollstaendige Hikvision-NVR-Plattformintegration
- keine vollstaendige ISAPI-/SDK-/RTSP-/Playback-Abdeckung
- kein universelles Multi-Vendor-NVR-Framework
- keine neue Medienplattform
- keine Kamera-only- oder Hub-/CMS-Semantik in diesem Pfad
- keine neue Alarm-, Workflow- oder Dispatch-Logik

## Anschluss fuer spaetere Betriebsformen

Spaetere reale Hikvision-NVR-Collector oder recordernahe Integrationen koennen denselben Pfad nutzen:

1. recordernahe Payloads in dieses kleine Schema uebersetzen
2. an `POST /api/v1/alarm-ingestion/external/hikvision/nvr` oder direkt an denselben Adapter-Service uebergeben
3. Resolver-, Audit-, Duplikat- und Kernlogik unveraendert weiterverwenden

So bleibt die Recorderlogik am Rand und der Leitstellenkern unveraendert fuehrend.
