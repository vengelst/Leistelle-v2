/**
 * Zentrale Komposition des Backends.
 *
 * Hier werden Infrastruktur, Stores, Fachservices und Adapter zu einer
 * lauffaehigen Anwendung zusammengesetzt. Die Datei ist damit der technische
 * Verdrahtungsplan des gesamten Backend-Prozesses.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { createAuditTrail, createLogger, type Logger } from "@leitstelle/observability";
import type { ApiProblem, SystemInfo } from "@leitstelle/contracts";

import type { BackendRuntimeConfig } from "./config/runtime.js";
import { createAuditPersistence } from "./db/audit-store.js";
import { createDatabaseClient } from "./db/client.js";
import { createRequestContext } from "./http/request-context.js";
import { toProblemResponse } from "./http/problem-details.js";
import { resolveRoute } from "./http/router.js";
import { createAlarmCoreModule } from "./modules/alarm-core/index.js";
import { createAlarmAssignmentService } from "./modules/alarm-core/assignment-service.js";
import { createAjaxCloudCmsCollectorStub } from "./modules/alarm-core/ajax-cloud-cms-collector-stub.js";
import { createAxisIpCameraAlarmAdapter } from "./modules/alarm-core/axis-ip-camera-adapter.js";
import { createAxisNvrAlarmAdapter } from "./modules/alarm-core/axis-nvr-adapter.js";
import { createUniviewIpCameraAlarmAdapter } from "./modules/alarm-core/uniview-ip-camera-adapter.js";
import { createAjaxNvr8chAlarmAdapter } from "./modules/alarm-core/ajax-nvr-8ch-adapter.js";
import { createAjaxHub2FourGJewellerAlarmAdapter } from "./modules/alarm-core/ajax-hub-2-4g-jeweller-adapter.js";
import { createAlarmArchiveService } from "./modules/alarm-core/archive-service.js";
import { createAlarmCaseService } from "./modules/alarm-core/case-service.js";
import { createDahuaNvrAlarmAdapter } from "./modules/alarm-core/dahua-nvr-adapter.js";
import { createExternalAlarmIngestionService } from "./modules/alarm-core/external-ingestion-service.js";
import { createExternalAlarmMediaIngestionService } from "./modules/alarm-core/external-media-ingestion-service.js";
import { createGrundigGuSeriesIpCameraAlarmAdapter } from "./modules/alarm-core/grundig-gu-series-ip-camera-adapter.js";
import { createGrundigGuRnAc5104nAlarmAdapter } from "./modules/alarm-core/grundig-gu-rn-ac5104n-adapter.js";
import { createHikvisionIpCameraAlarmAdapter } from "./modules/alarm-core/hikvision-ip-camera-adapter.js";
import { createHikvisionNvrAlarmAdapter } from "./modules/alarm-core/hikvision-nvr-adapter.js";
import { createAlarmIngestionModule } from "./modules/alarm-core/ingestion-module.js";
import { createAlarmPipelineService } from "./modules/alarm-core/pipeline-service.js";
import { createAlarmCaseReportService } from "./modules/alarm-core/report-service.js";
import { createDashboardService } from "./modules/dashboard/service.js";
import { createIdentityModule } from "./modules/identity/index.js";
import { createMasterDataModule } from "./modules/master-data/index.js";
import { createMonitoringPipelineService, createMonitoringStore } from "./modules/monitoring/index.js";
import { createReportingService } from "./modules/reporting/service.js";
import { createShiftPlanningModule } from "./modules/shift-planning/index.js";

type App = {
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  logger: Logger;
  close: () => Promise<void>;
};

export async function createApp(config: BackendRuntimeConfig): Promise<App> {
  // Produktionssicherheit wird vor dem Modulaufbau geprueft.
  assertProductionAppSafety(config);
  const logger = createLogger({ service: config.serviceName, environment: config.environment });
  const database = createDatabaseClient(config);
  const audit = createAuditTrail(logger, { service: config.serviceName }, {
    persist: createAuditPersistence(database)
  });
  const alarmCore = createAlarmCoreModule(database);
  const identity = await createIdentityModule(config, audit, logger, database, {
    hasBlockingAssignments: async (userId) => (await alarmCore.countActiveAssignmentsForUser(userId)) > 0
  });
  const masterData = createMasterDataModule(identity, audit, database);
  const alarmPipeline = createAlarmPipelineService({ identity, store: alarmCore, audit });
  const alarmAssignment = createAlarmAssignmentService({ identity, store: alarmCore, audit });
  const alarmIngestion = createAlarmIngestionModule({
    database,
    audit,
    logger,
    autoAssignLightEnabled: config.alarmAssignment.autoAssignLightEnabled,
    alarmAssignment
  });
  const externalAlarmMediaIngestion = createExternalAlarmMediaIngestionService({
    store: alarmCore,
    audit,
    logger,
    correlationToleranceSeconds: config.externalMediaIngestion.correlationToleranceSeconds,
    vendorCorrelationToleranceSeconds: config.externalMediaIngestion.vendorCorrelationToleranceSeconds,
    ...(config.externalMediaIngestion.sharedSecret ? { sharedSecret: config.externalMediaIngestion.sharedSecret } : {})
  });
  const externalAlarmIngestion = createExternalAlarmIngestionService({
    store: alarmCore,
    alarmIngestion,
    mediaCorrelation: externalAlarmMediaIngestion,
    audit,
    logger,
    ...(config.externalAlarmIngestion.sharedSecret ? { sharedSecret: config.externalAlarmIngestion.sharedSecret } : {})
  });
  const ajaxHub2FourGJewellerAlarmAdapter = createAjaxHub2FourGJewellerAlarmAdapter({
    externalAlarmIngestion
  });
  const ajaxCloudCmsCollectorStub = createAjaxCloudCmsCollectorStub({
    ajaxHubAlarmAdapter: ajaxHub2FourGJewellerAlarmAdapter
  });
  const axisIpCameraAlarmAdapter = createAxisIpCameraAlarmAdapter({
    externalAlarmIngestion
  });
  const axisNvrAlarmAdapter = createAxisNvrAlarmAdapter({
    externalAlarmIngestion
  });
  const univiewIpCameraAlarmAdapter = createUniviewIpCameraAlarmAdapter({
    externalAlarmIngestion
  });
  const ajaxNvr8chAlarmAdapter = createAjaxNvr8chAlarmAdapter({
    externalAlarmIngestion
  });
  const dahuaNvrAlarmAdapter = createDahuaNvrAlarmAdapter({
    externalAlarmIngestion
  });
  const grundigGuSeriesIpCameraAlarmAdapter = createGrundigGuSeriesIpCameraAlarmAdapter({
    externalAlarmIngestion
  });
  const hikvisionIpCameraAlarmAdapter = createHikvisionIpCameraAlarmAdapter({
    externalAlarmIngestion
  });
  const hikvisionNvrAlarmAdapter = createHikvisionNvrAlarmAdapter({
    externalAlarmIngestion
  });
  const grundigGuRnAc5104nAlarmAdapter = createGrundigGuRnAc5104nAlarmAdapter({
    externalAlarmIngestion
  });
  const mediaAccess = {
    ...(config.mediaStorage.baseUrl ? { mediaStorageBaseUrl: config.mediaStorage.baseUrl } : {})
  };
  const alarmCase = createAlarmCaseService({ identity, store: alarmCore, audit, mediaAccess });
  const alarmCaseReport = createAlarmCaseReportService({ identity, masterData, store: alarmCore, audit });
  const alarmArchive = createAlarmArchiveService({ identity, store: alarmCore, audit, mediaAccess });
  const monitoring = createMonitoringPipelineService({ identity, store: createMonitoringStore(database), audit });
  const dashboard = createDashboardService({ identity, alarmPipeline, alarmStore: alarmCore, monitoring, masterData, audit });
  const reporting = createReportingService({ identity, database, audit });
  const shiftPlanning = createShiftPlanningModule(identity, audit, database);

  const systemInfo: SystemInfo = {
    service: config.serviceName,
    environment: config.environment,
    version: config.version,
    apiVersion: "v1"
  };

  return {
    logger,
    async handle(req, res) {
      // Jeder Request laeuft zentral durch CORS, Routing, Fehlerabbildung und Audit.
      const context = createRequestContext(req, {
        trustProxy: config.http.trustProxy
      });
      const origin = req.headers.origin;

      if (origin && origin === config.cors.origin) {
        res.setHeader("access-control-allow-origin", origin);
        res.setHeader("vary", "origin");
        res.setHeader("access-control-allow-headers", "content-type, authorization, x-request-id");
        res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      }

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }

      try {
        const response = await resolveRoute({
          req,
          context,
          systemInfo,
          identity,
          masterData,
          alarmIngestion,
          externalAlarmIngestion,
          externalAlarmMediaIngestion,
          ajaxCloudCmsCollectorStub,
          axisIpCameraAlarmAdapter,
          axisNvrAlarmAdapter,
          univiewIpCameraAlarmAdapter,
          ajaxNvr8chAlarmAdapter,
          ajaxHub2FourGJewellerAlarmAdapter,
          dahuaNvrAlarmAdapter,
          grundigGuSeriesIpCameraAlarmAdapter,
          grundigGuRnAc5104nAlarmAdapter,
          hikvisionIpCameraAlarmAdapter,
          hikvisionNvrAlarmAdapter,
          alarmPipeline,
          alarmAssignment,
          alarmCase,
          alarmCaseReport,
          alarmArchive,
          monitoring,
          dashboard,
          reporting,
          shiftPlanning
        });

        if (response.auditEvent) {
          await audit.record(response.auditEvent, context);
        }

        res.statusCode = response.status;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify(response.body));
      } catch (error) {
        const problem: ApiProblem = toProblemResponse(error, context.requestId);
        if ((req.url ?? "").startsWith("/api/v1/alarm-ingestion")) {
          await audit.record(
            {
              category: "alarm.ingestion",
              action: "alarm.ingestion.rejected",
              outcome: "failure",
              metadata: {
                status: problem.status,
                code: problem.code,
                detail: problem.detail
              }
            },
            context
          );
        }

        logger.error("backend.request.failed", {
          requestId: context.requestId,
          method: req.method ?? "UNKNOWN",
          path: req.url ?? "/",
          clientIp: context.clientIp,
          protocol: context.protocol,
          problem
        });

        res.statusCode = problem.status;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify(problem));
      }
    },
    async close() {
      await database.close();
    }
  };
}

function assertProductionAppSafety(config: BackendRuntimeConfig): void {
  if (config.environment !== "production") {
    return;
  }
  if (config.auth.bootstrapPassword.trim() === "Leitstelle!2026") {
    throw new Error("AUTH_BOOTSTRAP_PASSWORD must not use the development default in production.");
  }
}
