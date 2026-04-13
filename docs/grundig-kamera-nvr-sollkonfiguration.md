# Grundig Kamera / NVR - Sollkonfiguration fuer Leitstelle

## Alarmkanal

- Motion Detection, Intrusion oder Line Crossing je nach Use Case aktivieren
- Tamper bzw. Video-/Netzwerkstoerung aktivieren, wenn das Geraet diese Events getrennt liefert
- Fachlich gilt:
  - Alarmkanal = HTTP / Vendor-Event / vorhandener Alarmadapter
  - Medienkanal = FTP / SFTP / Upload

FTP erzeugt standardmaessig **nicht** den primaeren Alarmfall.

## Snapshot-Konfiguration

- Anzahl Snapshots: `3`
- Snapshot-Intervall: `1s`
- Falls das Geraet nur feste Stufen anbietet:
  - naechstliegenden Wert verwenden

## Clip-Konfiguration

- Record on alarm: aktiv
- Pre-record: `3-5s`
- Post-record: `10-15s`

## FTP-/SFTP-/Upload-Konfiguration

- Host: Leitstellen-Medienziel
- Port: geraeteabhaengig
- Username: standortspezifischer Upload-Benutzer
- Password: standortspezifisches Upload-Passwort
- Base path: technischer Eingangsordner des Upload-Prozesses

Wenn das Grundig-Modell keine dynamischen Pfadplatzhalter kann, uebernimmt das Backend die finale kanonische Ablagestruktur.

## Unterstuetzte Grundig-Dateinamen

Mit `vendor_event_id`:

- `<sourceId>__<channelId>__<eventType>__<eventTs>__<vendorEventId>__img_001.jpg`
- `<sourceId>__<channelId>__<eventType>__<eventTs>__<vendorEventId>__img_002.jpg`
- `<sourceId>__<channelId>__<eventType>__<eventTs>__<vendorEventId>__img_003.jpg`
- `<sourceId>__<channelId>__<eventType>__<eventTs>__<vendorEventId>__clip.mp4`

Fallback ohne `vendor_event_id`:

- `<sourceId>__<channelId>__<eventType>__<eventTs>__img_001.jpg`
- `<sourceId>__<channelId>__<eventType>__<eventTs>__img_002.jpg`
- `<sourceId>__<channelId>__<eventType>__<eventTs>__img_003.jpg`
- `<sourceId>__<channelId>__<eventType>__<eventTs>__clip.mp4`

Beispiel:

- `GR_CAM_014__CH01__motion__20260411T143321Z__EVT88442191__img_001.jpg`
- `GR_CAM_014__CH01__motion__20260411T143321Z__EVT88442191__img_002.jpg`
- `GR_CAM_014__CH01__motion__20260411T143321Z__EVT88442191__img_003.jpg`
- `GR_CAM_014__CH01__motion__20260411T143321Z__EVT88442191__clip.mp4`

## Standort-Mapping

Im Standortkontext sollen mindestens gepflegt werden:

- `vendor = grundig`
- `sourceType = camera` oder `nvr`
- `externalSourceKey = sourceId`
- optional `channelNumber`
- internes Ziel ueber `componentId`
- optional `nvrComponentId`
- `mediaBundleProfileKey = three_images_one_clip`

## Hinweise

- Menuebezeichnungen koennen je nach Grundig-Modell und Firmware abweichen.
- Wenn Kamera und NVR parallel Events liefern, muss die standortbezogene Zuordnung eindeutig gepflegt werden.
- Ungueltige oder unvollstaendige Dateinamen werden bewusst nicht still geraten, sondern als orphaned behandelt.
