# Grundig GU-RN-AC5104N Adapter

## Ziel

Der Grundig-Adapter ist ein konkreter, kleiner Recorderpfad ueber der bereits vorhandenen externen Alarm-Ingestion.
Er nimmt Grundig-nahe GU-RN-AC5104N-Payloads an, normalisiert sie in `ExternalAlarmIngestionRequest` und delegiert danach an `POST /api/v1/alarm-ingestion/external`.

## Eingangspfad

- `POST /api/v1/alarm-ingestion/external/grundig/gu-rn-ac5104n`
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

- `sourceSystem = "grundig"`
- `sourceType = "nvr"`
- `externalEventId = sourceEventId`

Geraete-Hinweise:

1. Primaer wird zuerst `cameraSerialNumber`, danach `recorderSerialNumber` verwendet.
2. Falls keine Seriennummer vorhanden ist, wird zuerst `cameraIp`, danach `recorderIp` genutzt.
3. Medienreferenzen koennen eigene Kamera-Hinweise tragen und werden dann auf dieselbe bestehende Device-Aufloesung gelegt.

Bewusst unterstuetzte Eventcodes:

- `Motion`, `MotionDetect` -> `motion`
- `PID`, `PerimeterIntrusionDetection`, `IntrusionDetection` -> `area_entry`
- `LCD`, `LineCrossingDetection` -> `line_crossing`
- `VideoLoss` -> `video_loss`
- `VideoTampering`, `VideoTamperingDetection`, `Tamper` -> `sabotage`
- `PirDetection` -> `motion`
- `HumanVehicleDetection` -> `motion`

Diese Auswahl orientiert sich bewusst an den fuer die Geraetefamilie typischen Recorder-/Analytics-Menues wie Motion, PID, LCD, Video Loss und Video Tampering.

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

- der Adapter erzeugt einen pragmatischen Titel aus Kamera-/Regel-/Eventcode-Kontext
- Beschreibung nutzt vorhandene Felder wie `description`, `ruleName`, `zone`, `channel`, `eventAction`

## Fehler- und Duplikatverhalten

Der Grundig-Pfad erfindet keine eigenen Regeln, sondern baut auf der bestehenden externen Ingestion auf:

- Request-Validation-Fehler -> `400`
- unbekannte Seriennummer / IP / Standort -> bestehende externe Fehlercodes
- Shared-Secret-Fehler -> bestehende externe Fehlercodes
- Duplikate laufen ueber dieselbe `externalSourceRef`-Idempotenz:
  `grundig:nvr:<sourceEventId>`

## Bewusst unterstuetzte Felder und Nicht-Ziele

Bewusst unterstuetzt:

- ein kleiner Grundig-NVR-POST-Payload fuer den `GU-RN-AC5104N`
- typische Motion-, Perimeter-, Line-Crossing-, Video-Loss- und Tamper-Ereignisse
- minimale Snapshot-/Clip-Referenzen
- Seriennummern- und IP-basierte Device-Hints

Bewusst nicht enthalten:

- komplette Grundig-CGI-/Mail-/FTP-/ONVIF-Abdeckung
- Herstellerplattform fuer mehrere Recorder
- automatische Session-/Pull-Verbindungen zu Geraeten
- Medienproxy, Download- oder Transcoding-Plattform
- Event-Korrelation oder herstellerspezifische Alarm-Fachlogik

## Anschluss fuer spaetere Betriebsformen

Spaetere reale Collector oder Standortadapter koennen denselben Pfad nutzen:

1. Grundig-Eingang empfangen
2. auf dieses kleine GU-RN-AC5104N-Schema normalisieren
3. an `POST /api/v1/alarm-ingestion/external/grundig/gu-rn-ac5104n` oder direkt an denselben Adapter-Service uebergeben

So bleibt Grundig-spezifische Logik am Rand und der Leitstellenkern unveraendert fuehrend.
