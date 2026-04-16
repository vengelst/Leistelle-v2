/**
 * Manueller CLI-Einstiegspunkt fuer einen einzelnen Monitoring-Lauf.
 *
 * Das Skript ist hilfreich fuer lokale Diagnose und operative Checks, ohne dass
 * dafuer die komplette Worker-Runtime gestartet werden muss.
 */
import { runMonitoringScanJob } from "../jobs/monitoring-scan-job.js";

const result = await runMonitoringScanJob({
  trigger: "script"
});

process.stdout.write(`${JSON.stringify(result)}\n`);
