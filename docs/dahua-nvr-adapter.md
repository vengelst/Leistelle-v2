# Dahua-/NVR-Adapter

## Ziel

Der Dahua-/NVR-Adapter ist ein konkreter, kleiner Herstellerpfad ueber der bereits vorhandenen externen Alarm-Ingestion.
Er nimmt Dahua-nahe NVR-Payloads an, normalisiert sie in `ExternalAlarmIngestionRequest` und delegiert danach an `POST /api/v1/alarm-ingestion/external`.

## Eingangspfad

- `POST /api/v1/alarm-ingestion/external/dahua/nvr`
- Shared Secret wie bei der bestehenden externen Ingestion ueber `x-alarm-ingestion-key`
- gleiche Backend-Konfiguration ueber `ALARM_EXTERNAL_INGESTION_SHARED_SECRET`

## Minimales vendor-nahes Schema

Pflichtfelder:

- `sourceEventId`
- `eventCode`
- `eventTime`

Optionale Standort-/Geraete-Hinweise:

- `siteId`
- `recorderSerialNumber`
- `recorderIp`
- `cameraSerialNumber`
- `cameraIp`
- `channel`
- `cameraName`

Optionale Kontextfelder:

- `eventAction`
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

- `sourceSystem = "dahua"`
- `sourceType = "nvr"`
- `externalEventId = sourceEventId`

Geraete-Hinweise:

1. Primaer wird zuerst `cameraSerialNumber`, danach `recorderSerialNumber` verwendet.
2. Falls keine Seriennummer vorhanden ist, wird zuerst `cameraIp`, danach `recorderIp` genutzt.
3. Medienreferenzen koennen eigene Kamera-Hinweise tragen und werden dann auf dieselbe bestehende Device-Aufloesung gelegt.

Eventcode-Mapping:

- `VideoMotion`, `MotionDetect` -> `motion`
- `CrossLineDetection`, `Tripwire` -> `line_crossing`
- `CrossRegionDetection`, `Intrusion` -> `area_entry`
- `VideoBlind`, `Tamper` -> `sabotage`
- `VideoLoss` -> `video_loss`
- `IPCOffline` -> `camera_offline`
- `NVROffline`, `RecorderOffline` -> `nvr_offline`

Unbekannte Eventcodes:

- werden transparent in `snake_case` umgeformt
- danach der bestehenden externen Ingestion uebergeben
- der Alarmkern entscheidet unveraendert selbst, ob daraus ein bekannter Alarmtyp oder ein technisch unvollstaendiger Fall wird

Severity-Mapping:

- `1`, `critical`, `urgent`, `major` -> `critical`
- `2`, `high`, `warning` -> `high`
- `3`, `normal`, `medium`, `low`, `info` -> `normal`
- unbekannte Werte werden transparent kleingeschrieben durchgereicht

Titel / Beschreibung:

- der Adapter erzeugt immer einen pragmatischen Titel aus Kamera-/Regel-/Eventcode-Kontext
- Beschreibung nutzt vorhandene Felder wie `description`, `ruleName`, `zone`, `channel`, `eventAction`

## Fehler- und Duplikatverhalten

Der Dahua-Pfad erfindet keine eigenen Regeln, sondern baut auf der bestehenden externen Ingestion auf:

- Request-Validation-Fehler -> `400`
- unbekannte Seriennummer / IP / Standort -> bestehende externe Fehlercodes
- Shared-Secret-Fehler -> bestehende externe Fehlercodes
- Duplikate laufen ueber dieselbe `externalSourceRef`-Idempotenz:
  `dahua:nvr:<sourceEventId>`

## Bewusst unterstuetzte Felder und Nicht-Ziele

Bewusst unterstuetzt:

- ein kleiner Dahua-NVR-POST-Payload
- typische Bewegungs-, Linien-, Bereichs-, Sabotage- und Offline-Ereignisse
- minimale Snapshot-/Clip-Referenzen
- Seriennummern- und IP-basierte Device-Hints

Bewusst nicht enthalten:

- komplette Dahua-SDK-/CGI-/E-Mail-/FTP-Abdeckung
- Herstellerplattform fuer mehrere Recorder
- automatische Session-/Pull-Verbindungen zu Geraeten
- Medienproxy, Download- oder Transcoding-Plattform
- Event-Korrelation oder herstellerspezifische Alarm-Fachlogik

## Anschluss fuer spaetere Betriebsformen

Spaetere reale Collector oder Standortadapter koennen denselben Pfad nutzen:

1. Dahua-Eingang empfangen
2. auf dieses kleine NVR-Schema normalisieren
3. an `POST /api/v1/alarm-ingestion/external/dahua/nvr` oder direkt an denselben Adapter-Service uebergeben

So bleibt Dahua-spezifische Logik am Rand und der Leitstellenkern unveraendert fuehrend.
