/**
 * Technischer Scheduler fuer periodische Monitoring-Laeufe.
 *
 * Die Datei kapselt nur Laufsteuerung, Overlap-Schutz und Logging. Welche
 * fachliche Arbeit in einem Zyklus passiert, wird ueber `executeRun` injiziert.
 */
export type MonitoringSchedulerTrigger = "startup" | "interval";

export type MonitoringSchedulerResult = {
  checkedCount: number;
  skippedCount: number;
  openedCount: number;
  updatedCount: number;
  resolvedCount: number;
  siteStatusChanges: number;
};

type MonitoringSchedulerLogger = {
  info: (event: string, payload?: Record<string, unknown>) => void;
  error: (event: string, payload?: Record<string, unknown>) => void;
};

type MonitoringSchedulerSleep = (timeoutMs: number) => Promise<void>;

type MonitoringSchedulerConfig = {
  intervalSeconds: number;
  runOnStartup: boolean;
};

type CreateMonitoringSchedulerInput = {
  logger: MonitoringSchedulerLogger;
  executeRun: (trigger: MonitoringSchedulerTrigger) => Promise<MonitoringSchedulerResult>;
  sleep?: MonitoringSchedulerSleep;
  serviceName?: string;
  jobName?: string;
};

export type MonitoringScheduler = {
  start: (shouldStop: () => boolean) => Promise<void>;
  runCycle: (trigger: MonitoringSchedulerTrigger) => Promise<boolean>;
  isRunInProgress: () => boolean;
};

export function createMonitoringScheduler(
  config: MonitoringSchedulerConfig,
  input: CreateMonitoringSchedulerInput
): MonitoringScheduler {
  const sleep = input.sleep ?? defaultSleep;
  const serviceName = input.serviceName ?? "worker-runtime";
  const jobName = input.jobName ?? "monitoring.scan";

  let runInProgress = false;

  async function runCycle(trigger: MonitoringSchedulerTrigger): Promise<boolean> {
    // Ueberlappende Runs werden bewusst verworfen, um parallele Monitoring-Scans zu vermeiden.
    if (runInProgress) {
      input.logger.info("worker.job.skipped_overlap", {
        service: serviceName,
        jobName,
        trigger,
        reason: "previous_run_still_active"
      });
      return false;
    }

    runInProgress = true;
    const startedAt = Date.now();

    input.logger.info("worker.job.started", {
      service: serviceName,
      jobName,
      trigger
    });

    try {
      const result = await input.executeRun(trigger);
      input.logger.info("worker.job.completed", {
        service: serviceName,
        jobName,
        trigger,
        durationMs: Date.now() - startedAt,
        checkedCount: result.checkedCount,
        skippedCount: result.skippedCount,
        openedCount: result.openedCount,
        updatedCount: result.updatedCount,
        resolvedCount: result.resolvedCount,
        siteStatusChanges: result.siteStatusChanges
      });
      return true;
    } catch (error) {
      input.logger.error("worker.job.failed", {
        service: serviceName,
        jobName,
        trigger,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : { value: String(error) }
      });
      return false;
    } finally {
      runInProgress = false;
    }
  }

  async function start(shouldStop: () => boolean): Promise<void> {
    // Optionaler Startlauf fuer fruehes Aufholen nach Prozessneustart.
    if (config.runOnStartup && !shouldStop()) {
      await runCycle("startup");
    }

    while (!shouldStop()) {
      await sleep(config.intervalSeconds * 1000);
      if (shouldStop()) {
        break;
      }
      await runCycle("interval");
    }
  }

  return {
    start,
    runCycle,
    isRunInProgress: () => runInProgress
  };
}

function defaultSleep(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}
