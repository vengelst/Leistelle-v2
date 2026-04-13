# AJAX Hub 2 (4G) Jeweller Adapter

## Ziel

Der AJAX-Hub-Adapter ist ein konkreter, kleiner Hub-/Cloud-naher Integrationspfad ueber der bereits vorhandenen externen Alarm-Ingestion.
Er nimmt AJAX-Hub-2-(4G)-Jeweller-nahe Ereignisse an, normalisiert sie in `ExternalAlarmIngestionRequest` und delegiert danach an `POST /api/v1/alarm-ingestion/external`.
Ein optionaler noch duennerer Collector-Stub fuer Ajax-Cloud-/CMS-nahe Eingangspayloads kann davor liegen, uebersetzt dann aber nur minimal auf dieses Hub-Schema und delegiert anschliessend an denselben Adapter.

Wichtig: Dieser Pfad ist bewusst **kein** Recorder-/NVR-Analytics-Adapter.

## Eingangspfad

- `POST /api/v1/alarm-ingestion/external/ajax/hub2-4g-jeweller`
- Shared Secret wie bei der bestehenden externen Ingestion ueber `x-alarm-ingestion-key`
- gleiche Backend-Konfiguration ueber `ALARM_EXTERNAL_INGESTION_SHARED_SECRET`

## Minimales vendor-nahes Schema

Pflichtfelder:

- `sourceEventId`
- `eventType`
- `eventTime`

Optionale Hub-/Standort-/Geraete-Hinweise:

- `hubId`
- `hubName`
- `hubExternalId`
- `siteId`
- `deviceId`
- `detectorId`
- `deviceName`

Optionale Kontextfelder:

- `eventCode`
- `eventSubType`
- `room`
- `zone`
- `group`
- `partition`
- `user`
- `triggerSource`
- `severity`
- `title`
- `description`
- `rawPayload`

Optionale Foto-/Medienreferenzen:

- `media[]`
- pro Eintrag: `mediaType`, `url`, `mimeType`, `capturedAt`, `metadata`

## Normalisierung in `ExternalAlarmIngestionRequest`

Der Adapter setzt fest:

- `sourceSystem = "ajax"`
- `sourceType = "hub"`
- `externalEventId = sourceEventId`

Standort-/Geraete-Hinweise:

1. `siteId` bleibt der vorhandene Standortpfad.
2. `deviceId` ist bewusst ein direkter interner Device-Hinweis und nutzt die bestehende Resolver-Logik.
3. `detectorId`, `hubId`, `hubName`, `hubExternalId` und weitere Ajax-spezifische Felder bleiben nachvollziehbare Metadaten in `rawPayload` bzw. `technicalDetails`.

Bewusst unterstuetzte Eventtypen:

- `intrusion`, `intrusion_alarm`, `burglary_alarm`, `motion_alarm`, `alarm` -> `motion`
- `opening`, `opening_alarm`, `glass_break` -> `area_entry`
- `tamper`, `tamper_alarm`, `device_tamper`, `lid_open` -> `sabotage`
- `malfunction`, `device_malfunction`, `connection_lost`, `hub_offline`, `detector_offline`, `low_battery` -> `technical`
- `panic`, `panic_alarm`, `hold_up`, `medical`, `medical_alarm`, `fire`, `fire_alarm`, `leak`, `water_leak` -> `other_disturbance`

Unbekannte Eventtypen:

- werden transparent in `snake_case` umgeformt
- danach der bestehenden externen Ingestion uebergeben
- der Alarmkern entscheidet unveraendert selbst, ob daraus ein bekannter Alarmtyp oder ein technisch unvollstaendiger Fall wird

Severity-Mapping:

- `critical`, `major`, `high` -> `critical`
- `warning`, `medium` -> `high`
- `normal`, `low`, `info` -> `normal`
- ohne Severity wird eine kleine Default-Einordnung aus dem normalisierten Eventtyp genutzt

Titel / Beschreibung:

- der Adapter erzeugt einen pragmatischen Titel aus `deviceName`, `hubName` und Eventtyp
- Beschreibung nutzt vorhandene Felder wie `room`, `group`, `partition`, `user`, `triggerSource`

## Foto-/Medienreferenzen

AJAX-Hub-nahe Fotoverifikationsreferenzen werden nur minimal mitgefuehrt:

- `snapshot` -> `snapshot`
- `document` -> `document`

Es gibt bewusst:

- keine Fotoverifikationsplattform
- keinen Proxy
- keine Downloadlogik
- keine Medienaufbereitung

## Fehler- und Duplikatverhalten

Der AJAX-Pfad erfindet keine eigenen Regeln, sondern baut auf der bestehenden externen Ingestion auf:

- Request-Validation-Fehler -> `400`
- unbekannter Standort oder unbekanntes Device -> bestehende externe Fehlercodes
- Shared-Secret-Fehler -> bestehende externe Fehlercodes
- Duplikate laufen ueber dieselbe `externalSourceRef`-Idempotenz:
  `ajax:hub:<sourceEventId>`

## Bewusst unterstuetzte Felder und Nicht-Ziele

Bewusst unterstuetzt:

- ein kleiner hub-/cloud-naher POST-Payload fuer AJAX Hub 2 (4G) Jeweller
- Alarm-, Sabotage-, Malfunction- und Non-security-nahe Ereignisse
- minimale Foto-/Dokumentreferenzen
- direkte vorhandene `siteId`-/`deviceId`-Hinweise plus Ajax-spezifische Metadaten

Bewusst nicht enthalten:

- komplette AJAX Cloud-/Enterprise-API-Plattformintegration
- komplette CMS-/Cloud-Signaling-Abdeckung
- neue Fotoverifikationsplattform
- universelles Multi-Vendor-Framework
- Event-Korrelation oder neue Alarm-Fachlogik

## Anschluss fuer spaetere Betriebsformen

Spaetere reale Collector oder Cloud-/Enterprise-API-Adapter koennen denselben Pfad nutzen:

1. AJAX-Hub-/CMS-/Cloud-Ereignis empfangen
2. auf dieses kleine Hub-Schema normalisieren
3. an `POST /api/v1/alarm-ingestion/external/ajax/hub2-4g-jeweller` oder direkt an denselben Adapter-Service uebergeben

So bleibt AJAX-spezifische Logik am Rand und der Leitstellenkern unveraendert fuehrend.
