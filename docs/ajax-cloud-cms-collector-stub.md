# AJAX Cloud/CMS Collector Stub

## Ziel

Der Collector-Stub ist ein sehr duenner serverseitiger Rand vor dem bereits vorhandenen `AJAX Hub 2 (4G) Jeweller Adapter`.
Er nimmt Ajax-Cloud-/CMS-nahe Eingangspayloads an, normalisiert sie minimal auf das vorhandene AJAX-Hub-Eingangsmodell und delegiert dann direkt an den bestehenden Adapter.

Bewusst gilt:

- keine neue AJAX-Plattform
- keine neue Alarm-Pipeline
- keine direkte Alarm-Erstellung im Collector
- keine eigene Duplikat-, Audit-, Standort-, Device- oder Medienlogik

## Eingangspfad

- `POST /api/v1/alarm-ingestion/external/ajax/cloud-cms-stub`
- Shared Secret unveraendert ueber `x-alarm-ingestion-key`
- dieselbe Konfiguration ueber `ALARM_EXTERNAL_INGESTION_SHARED_SECRET`

## Minimales Collector-Schema

Pflichtfelder:

- `sourceEventId`
- `eventType`
- `occurredAt`

Optionale Hub-/Standort-/Geraetehinweise:

- `collectorSource` mit `cloud_signaling`, `cms` oder `enterprise_api`
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

Optionale Medienreferenzen:

- `media[]`
- pro Eintrag: `mediaType`, `uri`, `mimeType`, `capturedAt`, `metadata`

## Minimale Uebersetzung in den vorhandenen AJAX-Hub-Adapter

Der Collector fuehrt nur diese duenne Uebersetzung aus:

- `occurredAt` -> `eventTime`
- `media[].uri` -> `media[].url`
- `collectorSource` und optionales `rawPayload` werden als Collector-Metadaten in `rawPayload` des Hub-Modells mitgefuehrt
- alle uebrigen Felder werden moeglichst 1:1 an das vorhandene AJAX-Hub-Modell weitergereicht

Wichtig:

- keine zweite Event-Mapping-Logik
- kein zweites Severity-Mapping
- keine direkte Uebersetzung in `ExternalAlarmIngestionRequest`
- keine Umgehung des vorhandenen AJAX-Hub-Adapters

## Fehler- und Duplikatverhalten

Der Collector erfindet keine eigenen Regeln:

- Request-Validation-Fehler bleiben `400`
- Shared-Secret-Pruefung bleibt auf dem bestehenden externen Ingestion-Prinzip
- Standort-/Device-Aufloesung bleibt im vorhandenen Adapter-/Ingestion-Pfad
- Duplikate laufen ueber dieselbe bestehende `externalSourceRef`-Logik des AJAX-Hub-Adapters:
  `ajax:hub:<sourceEventId>`

## Unterschied zum vorhandenen AJAX-Hub-Adapter

Der Collector ist absichtlich noch etwas weiter am aeusseren Rand:

- nimmt cloud-/cms-nahe Felder wie `occurredAt` und `media[].uri` an
- formt diese nur leicht in das freigegebene AJAX-Hub-Eingangsmodell um
- laesst die eigentliche Ajax-nahe Eventnormalisierung weiterhin vollstaendig im vorhandenen Hub-Adapter

Der vorhandene Hub-Adapter bleibt damit das unmittelbare Zielmodell und der fachlich fuehrende AJAX-Rand.

## Bewusste Nicht-Ziele

- keine Cloud-Synchronisationsplattform
- kein Polling oder Subscription-Management
- keine Medienproxy- oder Downloadstrecke
- keine Event-Korrelation
- kein Multi-Tenant-Management
- keine neue Workflow-, Dispatch- oder Alarm-Fachlogik

## Anschluss fuer spaetere echte Collector

Spaetere produktionsnahe Ajax-Cloud-/CMS-/Enterprise-Collector koennen auf diesem Stub aufsetzen, indem sie:

1. ihr aeusseres Quellpayload in dieses kleine Collector-Schema uebersetzen
2. den vorhandenen `POST /api/v1/alarm-ingestion/external/ajax/cloud-cms-stub` bedienen oder denselben Stub-Service verwenden
3. die eigentliche AJAX-Hub- und externe Alarmlogik unveraendert weiterverwenden

So bleibt die Integrationskante klein und der Leitstellenkern weiterhin fuehrend.
