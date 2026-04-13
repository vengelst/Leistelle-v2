# Worker Runtime

Der operative Monitoring-Betrieb startet zentral in `workers/runtime/src/index.ts`.

## Monitoring-Scheduler

- Der periodische Scheduling-Pfad liegt in `workers/runtime/src/monitoring-scheduler.ts`.
- Die fachliche Ausfuehrung selbst bleibt im Backend-Job `apps/backend/src/jobs/monitoring-scan-job.ts`.
- Der Scheduler ruft keine Monitoring-Fachlogik direkt nach, sondern delegiert jeden Lauf an `runMonitoringScanJob()`.
- Ueberlappungen desselben Worker-Laufs werden im Scheduler verworfen und als `worker.job.skipped_overlap` geloggt.

## Konfiguration

- `WORKER_MONITORING_ENABLED`: aktiviert oder deaktiviert den periodischen Monitoring-Betrieb.
- `WORKER_MONITORING_INTERVAL_SECONDS`: steuert das Intervall des Scheduler-Loops.
- `WORKER_MONITORING_RUN_ON_STARTUP`: fuehrt direkt beim Worker-Start einen ersten Lauf aus.

Die Variablen werden in `workers/runtime/src/config.ts` geladen und sind in `.env.example` sowie `docker-compose.yml` vorgesehen.

## Betrieb

- Lokal: `npm run dev:worker`
- Testlauf fuer die Worker-Scheduler-Logik: `npm run test:worker`
- Einmaliger fachlicher Monitoring-Lauf ohne Scheduler: `npm run monitoring:scan -w @leitstelle/backend`

## Docker

Der vorgesehene Betriebsprozess ist der Compose-Service `worker`.

- Einstiegspunkt im Container: `node workers/runtime/dist/index.js`
- Das Image enthaelt sowohl `workers/runtime` als auch das gebaute Backend-Job-Modul.
- Der Worker spricht direkt mit der Datenbank und nicht ueber die HTTP-API.

## Restrisiken

- Der Reentrancy-Schutz gilt pro Worker-Prozess. Mehrere parallel gestartete Worker-Prozesse koennen weiterhin denselben Job gegen dieselbe Datenbank ausfuehren.
- Die Taktung ist absichtlich seriell und ruhig: Ein langer Lauf verschiebt den naechsten Zyklus nach hinten, statt eine Ueberlappung zu erzwingen.
