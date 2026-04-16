/**
 * Runtime-Konfiguration der Worker-Prozesse.
 *
 * Aktuell konzentriert sich die Worker-Runtime auf periodische Monitoring-Laeufe;
 * diese Datei uebersetzt dafuer die noetigen Env-Werte in ein kleines,
 * typsicheres Konfigurationsobjekt.
 */
import { parseBoolean, parseNumber, readBaseRuntimeEnvironment } from "@leitstelle/config";

export type WorkerRuntimeConfig = {
  environment: string;
  version: string;
  monitoring: {
    enabled: boolean;
    intervalSeconds: number;
    runOnStartup: boolean;
  };
};

export function loadWorkerRuntimeConfig(env: NodeJS.ProcessEnv = process.env): WorkerRuntimeConfig {
  const base = readBaseRuntimeEnvironment(env);

  return {
    environment: base.nodeEnv,
    version: base.appVersion,
    monitoring: {
      enabled: parseBoolean(env.WORKER_MONITORING_ENABLED, true),
      intervalSeconds: Math.max(5, parseNumber(env.WORKER_MONITORING_INTERVAL_SECONDS, 30)),
      runOnStartup: parseBoolean(env.WORKER_MONITORING_RUN_ON_STARTUP, true)
    }
  };
}
