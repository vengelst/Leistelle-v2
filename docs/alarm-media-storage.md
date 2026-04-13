# Alarm-Media-Storage

## Aktueller Stand

Der aktuelle Code fuehrt **keinen eigenen Blob- oder Dateispeicher** ein. Er verwaltet:

- kanonische `storageKey`-Pfade
- Vendor-Media-Inbox-Eintraege in `alarm_media_inbox`
- Alarmmedienreferenzen in `alarm_media`

Das ist bewusst eine kleine Referenz-/Pfadlogik innerhalb des bestehenden `alarm-core`.

## Was der Code heute erwartet

Der operative Kern erwartet, dass ein externer Medienkanal Dateien oder Referenzen anliefert und der Backend-Pfad daraus einen kanonischen `storageKey` erzeugt.

Der Code arbeitet damit auf Basis von:

- eingehendem `storageKey`
- optional `filename`
- optional `relativePath`
- optional `mimeType`
- optionaler Runtime-Konfiguration `mediaStorage.type`
- optionaler Runtime-Konfiguration `mediaStorage.baseUrl` fuer browserfaehige Referenz-URLs
- optionaler Runtime-Konfiguration `mediaStorage.localPath` als Betriebs-/Backup-Hinweis

Danach wird der kanonische Pfad nach folgendem Muster erzeugt:

`/alarms/YYYY/MM/KW/DD/<source_id>/<correlation_key>/<filename>`

## Produktive Betriebsvarianten

Der aktuelle Stand ist kompatibel mit:

- lokalem Filesystem
- NFS-/SMB-Freigabe
- S3-kompatiblem Objektspeicher
- vendor-/gateway-seitig bereits erreichbaren Medien-URLs

Wichtig ist nur, dass der verwendete Transportbaustein denselben kanonischen Pfad bzw. denselben referenzierbaren Key bedienen kann.

## Pilotbetrieb mit `mediaStorage.baseUrl`

Fuer relative kanonische Keys wie `/alarms/2026/.../bild.jpg` kann der Pilotbetrieb eine oeffentliche Basis-URL setzen:

- `MEDIA_STORAGE_TYPE=filesystem`
- `MEDIA_STORAGE_BASE_URL=https://leitstelle.vivahome.de/media`
- `MEDIA_STORAGE_LOCAL_PATH=/srv/leitstelle/media`

Die bestehende Medienvorschau bleibt referenzbasiert. Wenn ein `storageKey` bereits eine vollstaendige HTTP(S)-URL ist, wird diese direkt verwendet. Wenn der Key relativ ist und `mediaStorage.baseUrl` gesetzt ist, erzeugt die Vorschau daraus eine aufloesbare URL wie:

`https://leitstelle.vivahome.de/media/alarms/YYYY/MM/KW/DD/<source_id>/<correlation_key>/<filename>`

## Bewusste Nicht-Ziele des aktuellen Codes

Nicht enthalten sind:

- eigener FTP-Server
- eigener S3-Client
- Download-Proxy
- Transcoding
- Archiv- oder Retention-Engine

Diese Bausteine koennen spaeter produktionsnah ergaenzt werden, ohne den Alarmkern oder die Operator-UI neu zu bauen.

## Empfohlene produktive Schnittstelle

Ein externer Storage-/Transfer-Baustein sollte mindestens koennen:

1. Mediendateien in einen technischen Eingangsbereich schreiben
2. den kanonischen Zielpfad verwenden oder daraus ableitbar machen
3. den `storageKey` fuer `POST /api/v1/alarm-media-ingestion/external` liefern
4. bei Bedarf dieselben Keys fuer Downstream-Zugriff oder Archiv weiterverwenden

So bleibt der Leitstellenkern pfad- und referenzorientiert, waehrend die eigentliche Storage-Infrastruktur austauschbar bleibt.
