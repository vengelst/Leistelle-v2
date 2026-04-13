import type { Logger } from "@leitstelle/observability";
import { createLogger } from "@leitstelle/observability";

import type { BackendRuntimeConfig } from "../config/runtime.js";
import { loadBackendRuntimeConfig } from "../config/runtime.js";
import { createDatabaseClient } from "../db/client.js";
import { createMonitoringScanService, createMonitoringStore, type MonitoringScanResult } from "../modules/monitoring/index.js";

type RunMonitoringScanJobOptions = {
  config?: BackendRuntimeConfig;
  logger?: Logger;
  now?: Date;
  ignoreSchedule?: boolean;
  trigger?: string;
};

export async function runMonitoringScanJob(options: RunMonitoringScanJobOptions = {}): Promise<MonitoringScanResult> {
  const config = options.config ?? loadBackendRuntimeConfig();
  const logger = options.logger ?? createLogger({
    service: "backend-monitoring-worker",
    environment: config.environment
  });
  const startedAt = Date.now();

  const database = createDatabaseClient(config);
  const store = createMonitoringStore(database);
  const service = createMonitoringScanService({ store });

  logger.info("monitoring.scan.started", {
    service: "backend-monitoring-worker",
    trigger: options.trigger ?? "manual",
    ignoreSchedule: options.ignoreSchedule ?? false
  });

  try {
    const result = await service.runOnce({
      ...(options.now ? { now: options.now } : {}),
      ...(options.ignoreSchedule !== undefined ? { ignoreSchedule: options.ignoreSchedule } : {})
    });

    logger.info("monitoring.scan.completed", {
      service: "backend-monitoring-worker",
      trigger: options.trigger ?? "manual",
      durationMs: Date.now() - startedAt,
      checkedCount: result.checkedCount,
      skippedCount: result.skippedCount,
      openedCount: result.openedCount,
      updatedCount: result.updatedCount,
      resolvedCount: result.resolvedCount,
      siteStatusChanges: result.siteStatusChanges
    });

    return result;
  } catch (error) {
    logger.error("monitoring.scan.failed", {
      service: "backend-monitoring-worker",
      trigger: options.trigger ?? "manual",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : { value: String(error) }
    });
    throw error;
  } finally {
    await database.close();
  }
}
