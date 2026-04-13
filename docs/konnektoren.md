Hier ist eine saubere **Architekturübersicht in Textform** für die App-Doku.

# Alarm-Ingestion und Vendor-Konnektoren – Architekturübersicht

## 1. Grundprinzip

Die Leitstellensoftware nutzt für externe Herstelleranbindungen **schlanke vendor-spezifische Ingestion-Adapter**.
Diese Adapter sind **keine vollwertigen Plattform-Connectoren mit eigener Fachlogik**, sondern klar abgegrenzte Eingangsbausteine für Alarmmeldungen von Kameras, NVRs, Hubs oder vorgeschalteten Collector-Diensten.

Jeder Adapter hat genau eine Aufgabe:

* vendor-spezifischen Eingangs-Payload annehmen
* auf das interne Standardformat normalisieren
* an die zentrale externe Alarm-Ingestion delegieren

Dadurch bleibt die Herstellerintegration klein, nachvollziehbar und wartbar.

---

## 2. Architekturidee

Die Architektur folgt dem Muster:

**Externes Gerät / Vendor-System / Collector**
→ **vendor-spezifischer HTTP-Endpoint**
→ **Validierung des Eingangsformats**
→ **Vendor-Adapter / Normalisierung**
→ **`ExternalAlarmIngestionRequest`**
→ **`externalAlarmIngestion.ingest()`**
→ **zentraler Alarm-Core**
→ **Operator-Screen / Monitoring / Wallboard / Live-Update / Folgeprozesse**

---

## 3. Was ein Vendor-Konnektor im aktuellen System ist

Ein Vendor-Konnektor besteht im aktuellen System aus wenigen, klar getrennten Bausteinen:

### Route

Stellt den HTTP-Eingang für einen Hersteller und eine Domäne bereit.

Beispiele:

* `/api/v1/alarm-ingestion/external/hikvision/ip-camera`
* `/api/v1/alarm-ingestion/external/hikvision/nvr`
* `/api/v1/alarm-ingestion/external/axis/ip-camera`
* `/api/v1/alarm-ingestion/external/axis/nvr`
* `/api/v1/alarm-ingestion/external/unv/ip-camera`

### Validation

Prüft, ob der eingehende Payload formal zum erwarteten Vendor-Format passt.

### Contract

Beschreibt die herstellerspezifische Request-Struktur typisiert.

### Adapter

Übersetzt die Vendor-Daten in das interne Standardmodell.

### Zentrale Ingestion

Übernimmt die eigentliche zentrale Alarmverarbeitung.

---

## 4. Wie Alarme ins System kommen

Die Alarme werden im Regelfall **von außen ins System gepusht**.

Das bedeutet:

* Kamera, NVR, Hub oder ein vorgeschalteter Collector erkennt ein Ereignis
* dieses Ereignis wird per HTTP-Request an den passenden Vendor-Endpoint gesendet
* der Adapter normalisiert den Payload
* die zentrale Ingestion übernimmt den Alarm

Die Leitstelle pollt in diesem Modell also nicht dauerhaft aktiv jedes Gerät ab, sondern nimmt eingehende Alarmmeldungen entgegen.

---

## 5. Typische Alarmquellen

Die Alarmquelle kann je nach Hersteller und Integrationsart unterschiedlich sein:

### Direktes Gerät

Zum Beispiel:

* IP-Kamera sendet Alarm direkt
* NVR sendet Alarm direkt
* Hub sendet Alarm direkt

### Vorgeschalteter Collector

Zum Beispiel:

* Cloud-Collector
* CMS-Collector
* herstellerspezifischer Stub/Translator
* On-Prem-Gateway

### Lokaler Integrationsdienst

Zum Beispiel:

* kleines Node-/Python-Script
* Webhook-Transformer
* lokaler Alarm-Forwarder

Alle diese Varianten enden im selben Muster:
**externer Alarm → Vendor-Endpoint → Adapter → zentrale Ingestion**

---

## 6. Aufgabe des Vendor-Adapters

Der Vendor-Adapter enthält bewusst **keine große Fachlogik**.
Er macht im Wesentlichen nur diese Schritte:

### 1. Eingangsparameter lesen

Zum Beispiel:

* `eventCode`
* `eventType`
* `cameraId`
* `nvrId`
* `cameraSerialNumber`
* `nvrSerialNumber`
* `cameraIp`
* `nvrIp`
* `channel`
* `analyticsName`
* `ruleName`
* `media`

### 2. Alarmtyp normalisieren

Beispiele:

* `motionDetection` → `motion`
* `lineDetectionStart` → `line_crossing`
* `intrusion` → `area_entry`
* `diskFull` → `technical`
* `channelOffline` → `camera_offline`
* `recorderOffline` → `nvr_offline`

### 3. Quelle eindeutig kennzeichnen

Beispiele:

* `hikvision:camera:<id>`
* `hikvision:nvr:<id>`
* `axis:camera:<id>`
* `axis:nvr:<id>`
* `unv:camera:<id>`

### 4. Internes Standardformat erzeugen

Normalisiert werden typischerweise:

* `sourceSystem`
* `sourceType`
* `externalSourceRef`
* `alarmType`
* `title`
* `severity`
* Geräte-Hints
* Standort-Hints
* `rawPayload`

### 5. An zentrale Ingestion delegieren

Am Ende ruft der Adapter nur die bestehende zentrale Funktion auf:

* `externalAlarmIngestion.ingest(...)`

---

## 7. Was die zentrale Ingestion übernimmt

Die zentrale externe Ingestion ist der eigentliche Übergang in den Alarm-Core.
Dort liegen die gemeinsamen systemweiten Aufgaben, nicht in den Vendor-Adaptern.

Typische Aufgaben:

* Authentifizierung des Eingangs
* zentrale Validierungslogik
* Deduplikation
* Audit
* Fehlerbehandlung
* Anlegen oder Weiterreichen von Alarmen
* Übergabe an Monitoring, Operator-Ansicht, Wallboard und Live-Update
* eventuelle Zuordnung zu Geräten, Standorten oder bestehenden Fällen

Damit bleibt die Fachlogik an einer Stelle gebündelt.

---

## 8. Domänentrennung

Ein zentrales Architekturprinzip ist die klare Trennung der Gerätedomänen.

### Kamera-Domäne

Für reine Kamerapfade:

* `sourceType: "camera"`
* nur kamerabezogene Felder
* keine Recorder-/Hub-Logik

Typische Felder:

* `cameraId`
* `cameraSerialNumber`
* `cameraIp`
* `cameraName`
* optional `analyticsName`
* optional `ruleName`

### NVR-/Recorder-Domäne

Für Recorder- oder NVR-Pfade:

* `sourceType: "nvr"`
* NVR-/Recorder-Felder erlaubt
* Kamera-Kontext nur ergänzend

Typische Felder:

* `nvrId`
* `nvrName`
* `nvrSerialNumber`
* `nvrIp`
* `channel`
* optional Kamera-Hinweise

### Hub-/Controller-Domäne

Für Zentralen oder Hubs:

* eigener Domänentyp
* eigene Felder
* getrennte Routen und Adapter

Diese Trennung verhindert, dass Herstellerintegration unkontrolliert vermischt wird.

---

## 9. Sicherheitsmodell

Externe Alarmquellen dürfen nicht unkontrolliert Alarme einspeisen.
Deshalb wird der Eingang abgesichert, typischerweise über ein **Shared Secret**.

Ablauf:

* externer Sender ruft den Vendor-Endpoint auf
* Secret wird mitgegeben
* Ingestion prüft, ob der Sender autorisiert ist
* nur autorisierte Requests werden weiterverarbeitet

Damit wird verhindert, dass fremde oder manipulierte Requests in den Alarm-Core gelangen.

---

## 10. Umgang mit unbekannten Events

Ein wichtiger Designpunkt ist der robuste Umgang mit unbekannten Vendor-Events.

Statt unbekannte Events hart zu verwerfen, werden sie möglichst:

* transparent übernommen
* in eine lesbare interne Form gebracht
* im `rawPayload` erhalten

Beispiel:

* `objectLeftBehindStart` → `object_left_behind_start`

Das macht die Adapter robust gegenüber:

* neuen Firmware-Versionen
* zusätzlichen Analytics-Funktionen
* herstellerspezifischen Sonderfällen

---

## 11. Warum diese Architektur bewusst schlank ist

Die aktuelle Architektur ist absichtlich kein schweres Integrationsframework.

Nicht Teil der Vendor-Adapter sind:

* kein generisches Vendor-SDK
* kein globales Adapter-Framework
* kein permanentes Session-Management
* keine Pull-Plattform
* kein Geräte-Discovery-System im Adapter
* keine eigene Alarm-Workflow-Engine pro Hersteller
* keine Datenbanklogik im Adapter

Stattdessen gilt:

* kleine Eingangsadapter
* zentrale Fachlogik im Core
* klare Trennung zwischen Herstellerintegration und Leitstellenlogik

Das reduziert Komplexität und erleichtert die Erweiterung um weitere Hersteller.

---

## 12. Beispielhafter Ablauf eines Kamera-Alarms

### Beispiel: IP-Kamera erkennt Bewegung

1. Die Kamera oder ein vorgeschalteter Collector erkennt ein Motion-Event.
2. Der Alarm wird per HTTP an den Kamera-Endpoint des Herstellers gesendet.
3. Die Route nimmt den Request entgegen.
4. Das Schema validiert das Eingangsformat.
5. Der Kamera-Adapter normalisiert das Event.
6. Es wird ein `ExternalAlarmIngestionRequest` erzeugt.
7. Der Adapter delegiert an `externalAlarmIngestion.ingest()`.
8. Der Alarm-Core verarbeitet den Alarm weiter.
9. Operator-Screen, Monitoring, Wallboard und Live-Update werden versorgt.

---

## 13. Beispielhafter Ablauf eines NVR-Alarms

### Beispiel: NVR meldet Disk-Fehler

1. Der NVR erkennt `diskFull`, `recordError` oder `storageError`.
2. Der NVR sendet einen HTTP-POST an den passenden NVR-Endpoint.
3. Route und Validation nehmen den Alarm an.
4. Der NVR-Adapter mappt das Event z. B. auf `technical`.
5. Es wird ein standardisiertes internes Alarmobjekt erzeugt.
6. Die zentrale Ingestion übernimmt den Alarm.
7. Der Alarm erscheint anschließend im Leitstellenkontext.

---

## 14. Vorteile des Musters

### Klare Erweiterbarkeit

Neue Hersteller können mit kleinen Adaptern ergänzt werden.

### Geringe Komplexität

Kein schwergewichtiges Hersteller-Framework nötig.

### Saubere Zuständigkeiten

* Vendor-Adapter: nur Normalisierung
* zentrale Ingestion/Core: Fachlogik

### Gute Testbarkeit

Jeder Adapter kann isoliert getestet werden.

### Robuste Herstellerintegration

Unbekannte Events können nachvollziehbar weitergereicht werden.

---

## 15. Kurzfassung für die Doku

Die Leitstellensoftware bindet externe Hersteller über vendor-spezifische HTTP-Ingestion-Endpunkte an. Geräte, NVRs, Hubs oder vorgeschaltete Collector-Dienste senden ihre Alarmmeldungen an den passenden Endpoint. Ein schlanker Vendor-Adapter validiert und normalisiert den herstellerspezifischen Payload auf das interne Standardformat und delegiert anschließend an die zentrale `externalAlarmIngestion`. Dort erfolgen Authentifizierung, Deduplikation, Audit und die eigentliche Weiterverarbeitung im Alarm-Core. Die Adapter enthalten bewusst keine eigene Fachlogik, sondern dienen ausschließlich als klar abgegrenzte Übersetzungsschicht zwischen Herstellerformat und Leitstellenkern.

Wenn du willst, mache ich dir daraus direkt noch eine **kompaktere Version für das Pflichtenheft**.
