/**
 * Startpunkt der Worker-Runtime.
 *
 * Der Prozess registriert technische Jobs, startet den Monitoring-Scheduler und
 * delegiert die eigentliche Monitoring-Ausfuehrung an den bereits gebauten
 * Backend-Job. So bleibt die Worker-Runtime klein und dupliziert keine
 * Fachlogik aus dem Backend.
 */
import { createLogger } from "@leitstelle/observability";

import { loadWorkerRuntimeConfig } from "./config.js";
import { getRegisteredJobs } from "./job-registry.js";
import { createMonitoringScheduler, type MonitoringSchedulerTrigger } from "./monitoring-scheduler.js";

const config = loadWorkerRuntimeConfig(process.env);
const logger = createLogger({
  service: "worker-runtime",
  environment: config.environment
});
const jobs = getRegisteredJobs();

logger.info("worker.runtime.started", {
  service: "worker-runtime",
  version: config.version,
  jobs: jobs.map((job) => ({
    name: job.name,
    schedule: job.schedule,
    ...(job.intervalEnv ? { intervalEnv: job.intervalEnv } : {})
  })),
  monitoring: {
    enabled: config.monitoring.enabled,
    intervalSeconds: config.monitoring.intervalSeconds,
    runOnStartup: config.monitoring.runOnStartup
  }
});

let stopping = false;
let pendingDelay: NodeJS.Timeout | undefined;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    if (pendingDelay) {
      clearTimeout(pendingDelay);
      pendingDelay = undefined;
    }
    logger.info("worker.runtime.stopping", {
      service: "worker-runtime",
      signal
    });
  });
}

try {
  if (config.monitoring.enabled) {
    // Der Worker fuehrt nur den Scheduler aus; die fachliche Scan-Logik liegt im Backend-Job.
    await createMonitoringScheduler(config.monitoring, {
      logger,
      executeRun: executeMonitoringRun
    }).start(() => stopping);
  } else {
    logger.info("worker.runtime.monitoring.disabled", {
      service: "worker-runtime"
    });
    await waitUntilStopped();
  }
} finally {
  logger.info("worker.runtime.stopped", {
    service: "worker-runtime"
  });
}

async function executeMonitoringRun(trigger: MonitoringSchedulerTrigger): Promise<{
  checkedCount: number;
  skippedCount: number;
  openedCount: number;
  updatedCount: number;
  resolvedCount: number;
  siteStatusChanges: number;
}> {
  const { runMonitoringScanJob } = await importBackendMonitoringJob();
  return await runMonitoringScanJob({
    trigger: `worker:${trigger}`
  });
}

async function importBackendMonitoringJob(): Promise<{
  runMonitoringScanJob: (options?: { trigger?: string }) => Promise<{
    checkedCount: number;
    skippedCount: number;
    openedCount: number;
    updatedCount: number;
    resolvedCount: number;
    siteStatusChanges: number;
  }>;
}> {
  const jobUrl = new URL("../../../apps/backend/dist/jobs/monitoring-scan-job.js", import.meta.url);
  try {
    return await import(jobUrl.href);
  } catch (error) {
    throw new Error(
      `Backend monitoring job module is unavailable at ${jobUrl.pathname}. Build the backend before starting the worker.`,
      { cause: error instanceof Error ? error : undefined }
    );
  }
}

function sleep(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    pendingDelay = setTimeout(() => {
      pendingDelay = undefined;
      resolve();
    }, timeoutMs);
  });
}

async function waitUntilStopped(): Promise<void> {
  while (!stopping) {
    await sleep(1000);
  }
}
