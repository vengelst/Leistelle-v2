/**
 * Zentrale HTTP-Routenauflosung des Backends.
 *
 * Diese Datei verbindet den Node-HTTP-Eingang mit den Fachservices:
 * URL-Matching, Request-Validierung, Parameterlesen und die Rueckgabe im
 * einheitlichen API-Envelope passieren hier.
 */
import type { IncomingMessage } from "node:http";

import { AppError } from "@leitstelle/observability";
import type {
  AlarmPipelineFilter,
  ExternalAlarmMediaIngestionRequest,
  AlarmArchiveFilter,
  ApiEnvelope,
  AuditEvent,
  GlobalSettingsUpdateInput,
  ReportingFilter,
  MonitoringPipelineFilter,
  AlarmSourceMappingUpsertInput,
  SiteUpsertInput,
  ShiftPlanningFilter,
  SystemInfo
} from "@leitstelle/contracts";

import type { RequestContext } from "./request-context.js";
import type { AlarmAssignmentService } from "../modules/alarm-core/assignment-service.js";
import type { AjaxCloudCmsCollectorStubService } from "../modules/alarm-core/ajax-cloud-cms-collector-stub.js";
import type { AxisIpCameraAlarmAdapterService } from "../modules/alarm-core/axis-ip-camera-adapter.js";
import type { AxisNvrAlarmAdapterService } from "../modules/alarm-core/axis-nvr-adapter.js";
import type { UniviewIpCameraAlarmAdapterService } from "../modules/alarm-core/uniview-ip-camera-adapter.js";
import type { AjaxNvr8chAlarmAdapterService } from "../modules/alarm-core/ajax-nvr-8ch-adapter.js";
import type { AjaxHub2FourGJewellerAlarmAdapterService } from "../modules/alarm-core/ajax-hub-2-4g-jeweller-adapter.js";
import type { AlarmArchiveService } from "../modules/alarm-core/archive-service.js";
import type { AlarmCaseService } from "../modules/alarm-core/case-service.js";
import type { DahuaNvrAlarmAdapterService } from "../modules/alarm-core/dahua-nvr-adapter.js";
import type { ExternalAlarmIngestionService } from "../modules/alarm-core/external-ingestion-service.js";
import type { ExternalAlarmMediaIngestionService } from "../modules/alarm-core/external-media-ingestion-service.js";
import type { GrundigGuSeriesIpCameraAlarmAdapterService } from "../modules/alarm-core/grundig-gu-series-ip-camera-adapter.js";
import type { GrundigGuRnAc5104nAlarmAdapterService } from "../modules/alarm-core/grundig-gu-rn-ac5104n-adapter.js";
import type { HikvisionIpCameraAlarmAdapterService } from "../modules/alarm-core/hikvision-ip-camera-adapter.js";
import type { HikvisionNvrAlarmAdapterService } from "../modules/alarm-core/hikvision-nvr-adapter.js";
import type { AlarmCaseReportService } from "../modules/alarm-core/report-service.js";
import type { AlarmIngestionService } from "../modules/alarm-core/service.js";
import type { AlarmPipelineService } from "../modules/alarm-core/pipeline-service.js";
import type { IdentityService } from "../modules/identity/types.js";
import type { MasterDataService } from "../modules/master-data/service.js";
import type { MonitoringPipelineService } from "../modules/monitoring/pipeline-service.js";
import type { ReportingService } from "../modules/reporting/service.js";
import type { DashboardService } from "../modules/dashboard/service.js";
import type { ShiftPlanningService } from "../modules/shift-planning/service.js";
import {
  alarmAcknowledgeSchema,
  alarmActionSchema,
  ajaxCloudCmsCollectorStubSchema,
  axisIpCameraAlarmIngestionSchema,
  axisNvrAlarmIngestionSchema,
  univiewIpCameraAlarmIngestionSchema,
  ajaxNvr8chAlarmIngestionSchema,
  ajaxHub2FourGJewellerAlarmIngestionSchema,
  alarmArchiveSchema,
  alarmAssessmentSchema,
  alarmCloseSchema,
  alarmCommentSchema,
  alarmFollowUpSchema,
  dahuaNvrAlarmIngestionSchema,
  externalAlarmIngestionSchema,
  externalAlarmMediaIngestionSchema,
  alarmIngestionSchema,
  alarmReleaseSchema,
  alarmReservationSchema,
  alarmWorkflowProfileSchema,
  alarmSourceMappingUpsertSchema,
  customerUpsertSchema,
  deviceUpsertSchema,
  globalSettingsSchema,
  grundigGuSeriesIpCameraAlarmIngestionSchema,
  grundigGuRnAc5104nAlarmIngestionSchema,
  hikvisionIpCameraAlarmIngestionSchema,
  hikvisionNvrAlarmIngestionSchema,
  loginRequestSchema,
  logoutRequestSchema,
  monitoringDisturbanceAcknowledgeSchema,
  monitoringDisturbanceNoteSchema,
  monitoringServiceCaseCreateSchema,
  planUpsertSchema,
  readAlarmInstructionContext,
  readAlarmMediaInboxFilter,
  readAlarmArchiveFilter,
  readAlarmPipelineFilter,
  readAlarmCaseExportFormat,
  readAlarmMediaAccessMode,
  readAlarmWorkflowProfileFilter,
  readMonitoringPipelineFilter,
  readReportingFilter,
  readShiftPlanningFilter,
  readValidatedJsonBody,
  siteUpsertSchema,
  shiftUpsertSchema,
  statusChangeSchema,
  userActivationSchema,
  userUpsertSchema
} from "./validation.js";

type RouteResponse = {
  status: number;
  body: ApiEnvelope<unknown>;
  auditEvent?: AuditEvent;
};

type RouteInput = {
  req: IncomingMessage;
  context: RequestContext;
  systemInfo: SystemInfo;
  identity: IdentityService;
  masterData: MasterDataService;
  alarmIngestion: AlarmIngestionService;
  externalAlarmIngestion: ExternalAlarmIngestionService;
  externalAlarmMediaIngestion: ExternalAlarmMediaIngestionService;
  ajaxCloudCmsCollectorStub: AjaxCloudCmsCollectorStubService;
  axisIpCameraAlarmAdapter: AxisIpCameraAlarmAdapterService;
  axisNvrAlarmAdapter: AxisNvrAlarmAdapterService;
  univiewIpCameraAlarmAdapter: UniviewIpCameraAlarmAdapterService;
  ajaxNvr8chAlarmAdapter: AjaxNvr8chAlarmAdapterService;
  ajaxHub2FourGJewellerAlarmAdapter: AjaxHub2FourGJewellerAlarmAdapterService;
  dahuaNvrAlarmAdapter: DahuaNvrAlarmAdapterService;
  grundigGuSeriesIpCameraAlarmAdapter: GrundigGuSeriesIpCameraAlarmAdapterService;
  grundigGuRnAc5104nAlarmAdapter: GrundigGuRnAc5104nAlarmAdapterService;
  hikvisionIpCameraAlarmAdapter: HikvisionIpCameraAlarmAdapterService;
  hikvisionNvrAlarmAdapter: HikvisionNvrAlarmAdapterService;
  alarmPipeline: AlarmPipelineService;
  alarmAssignment: AlarmAssignmentService;
  alarmCase: AlarmCaseService;
  alarmCaseReport: AlarmCaseReportService;
  alarmArchive: AlarmArchiveService;
  monitoring: MonitoringPipelineService;
  dashboard: DashboardService;
  reporting: ReportingService;
  shiftPlanning: ShiftPlanningService;
};

export async function resolveRoute(input: RouteInput): Promise<RouteResponse> {
  // Routing bleibt explizit und versionsgebunden unter /api/v1.
  const method = input.req.method ?? "GET";
  const url = new URL(input.req.url ?? "/", "http://localhost");

  if (method === "GET" && url.pathname === "/health") {
    return {
      status: 200,
      body: {
        data: {
          status: "ok",
          timestamp: new Date().toISOString()
        },
        meta: {
          requestId: input.context.requestId
        }
      }
    };
  }

  if (method === "GET" && url.pathname === "/api/v1/system/info") {
    return {
      status: 200,
      body: {
        data: input.systemInfo,
        meta: {
          requestId: input.context.requestId
        }
      },
      auditEvent: {
        category: "system.read",
        action: "backend.system.info.read",
        outcome: "success"
      }
    };
  }

  if (method === "GET" && url.pathname === "/api/v1/dashboard/overview") {
    const token = readBearerToken(input.req);
    const overview = await input.dashboard.getOverview(token, input.context.requestId);
    return response(input.context.requestId, { overview });
  }

  if (method === "GET" && url.pathname === "/api/v1/alarm-media-inbox") {
    const token = readBearerToken(input.req);
    const filter = readAlarmMediaInboxFilter(url.searchParams);
    const inbox = await input.alarmCase.listMediaInbox(token, filter, input.context.requestId);
    return response(input.context.requestId, { inbox });
  }

  if (method === "GET" && url.pathname === "/api/v1/reporting/overview") {
    const token = readBearerToken(input.req);
    const filter: ReportingFilter = readReportingFilter(url.searchParams);
    const overview = await input.reporting.getOverview(token, filter, input.context.requestId);
    return response(input.context.requestId, { overview });
  }

  if (method === "GET" && url.pathname === "/api/v1/shift-planning/overview") {
    const token = readBearerToken(input.req);
    const filter: ShiftPlanningFilter = readShiftPlanningFilter(url.searchParams);
    const overview = await input.shiftPlanning.getOverview(token, filter, input.context.requestId);
    return response(input.context.requestId, { overview });
  }

  if (method === "POST" && url.pathname === "/api/v1/shift-planning/shifts") {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, shiftUpsertSchema);
    const overview = await input.shiftPlanning.upsertShift(token, body, input.context.requestId);
    return response(input.context.requestId, { overview });
  }

  if (method === "POST" && url.pathname === "/api/v1/auth/login") {
    const body = await readValidatedJsonBody(input.req, loginRequestSchema);
    const session = await input.identity.login(body, input.context.requestId);

    return response(input.context.requestId, { session });
  }

  if (method === "GET" && url.pathname === "/api/v1/auth/session") {
    const token = readBearerToken(input.req);
    const session = await input.identity.getSession(token);

    return response(input.context.requestId, { session });
  }

  if (method === "GET" && url.pathname === "/api/v1/admin/users/overview") {
    const token = readBearerToken(input.req);
    const overview = await input.identity.getUserAdministrationOverview(token, input.context.requestId);
    return response(input.context.requestId, { overview });
  }

  if (method === "POST" && url.pathname === "/api/v1/admin/users") {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, userUpsertSchema);
    const overview = await input.identity.upsertUser(token, body, input.context.requestId);
    return response(input.context.requestId, { overview });
  }

  const userActivationMatch = url.pathname.match(/^\/api\/v1\/admin\/users\/([^/]+)\/activation$/);
  if (method === "POST" && userActivationMatch) {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, userActivationSchema);
    const overview = await input.identity.setUserActivation(token, userActivationMatch[1]!, body, input.context.requestId);
    return response(input.context.requestId, { overview });
  }

  if (method === "POST" && url.pathname === "/api/v1/auth/status/active") {
    const token = readBearerToken(input.req);
    const user = await input.identity.setActive(token, input.context.requestId);

    return response(input.context.requestId, { user });
  }

  if (method === "POST" && url.pathname === "/api/v1/auth/status/pause") {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, statusChangeSchema);
    const user = await input.identity.setPause(token, body, input.context.requestId);

    return response(input.context.requestId, { user });
  }

  if (method === "POST" && url.pathname === "/api/v1/auth/status/resume") {
    const token = readBearerToken(input.req);
    const user = await input.identity.resumeFromPause(token, input.context.requestId);

    return response(input.context.requestId, { user });
  }

  if (method === "POST" && url.pathname === "/api/v1/auth/logout") {
    const token = readBearerToken(input.req);
    const logoutOptions = hasRequestBody(input.req)
      ? await readValidatedJsonBody(input.req, logoutRequestSchema)
      : {};
    await input.identity.logout(token, input.context.requestId, logoutOptions);

    return response(input.context.requestId, { loggedOut: true });
  }

  if (method === "GET" && url.pathname === "/api/v1/master-data/overview") {
    const token = readBearerToken(input.req);
    const overview = await input.masterData.getOverview(token, input.context.requestId);

    return response(input.context.requestId, { overview });
  }

  if (method === "GET" && url.pathname === "/api/v1/map/site-markers") {
    const token = readBearerToken(input.req);
    const siteMarkers = await input.masterData.getSiteMarkers(token, input.context.requestId);

    return response(input.context.requestId, { siteMarkers });
  }

  if (method === "POST" && url.pathname === "/api/v1/master-data/customers") {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, customerUpsertSchema);
    const overview = await input.masterData.upsertCustomer(token, body, input.context.requestId);

    return response(input.context.requestId, { overview });
  }

  if (method === "POST" && url.pathname === "/api/v1/master-data/sites") {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody<SiteUpsertInput>(input.req, siteUpsertSchema);
    const overview = await input.masterData.upsertSite(token, body, input.context.requestId);

    return response(input.context.requestId, { overview });
  }

  if (method === "POST" && url.pathname === "/api/v1/master-data/devices") {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, deviceUpsertSchema);
    const overview = await input.masterData.upsertDevice(token, body, input.context.requestId);

    return response(input.context.requestId, { overview });
  }

  if (method === "POST" && url.pathname === "/api/v1/master-data/alarm-source-mappings") {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody<AlarmSourceMappingUpsertInput>(input.req, alarmSourceMappingUpsertSchema);
    const overview = await input.masterData.upsertAlarmSourceMapping(token, body, input.context.requestId);

    return response(input.context.requestId, { overview });
  }

  const masterDataDeviceDeleteMatch = url.pathname.match(/^\/api\/v1\/master-data\/devices\/([^/]+)$/);
  if (method === "DELETE" && masterDataDeviceDeleteMatch) {
    const token = readBearerToken(input.req);
    const overview = await input.masterData.deleteDevice(token, masterDataDeviceDeleteMatch[1]!, input.context.requestId);

    return response(input.context.requestId, { overview });
  }

  if (method === "POST" && url.pathname === "/api/v1/master-data/plans") {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, planUpsertSchema);
    const overview = await input.masterData.upsertPlan(token, body, input.context.requestId);

    return response(input.context.requestId, { overview });
  }

  if (method === "POST" && url.pathname === "/api/v1/master-data/global-settings") {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody<GlobalSettingsUpdateInput>(input.req, globalSettingsSchema);
    const overview = await input.masterData.updateGlobalSettings(token, body, input.context.requestId);

    return response(input.context.requestId, { overview });
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-ingestion") {
    const body = await readValidatedJsonBody(input.req, alarmIngestionSchema);
    const result = await input.alarmIngestion.ingest(body, input.context.requestId);

    return response(input.context.requestId, result);
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-ingestion/external") {
    const body = await readValidatedJsonBody(input.req, externalAlarmIngestionSchema);
    const result = await input.externalAlarmIngestion.ingest(
      body,
      input.context.requestId,
      readOptionalHeader(input.req, "x-alarm-ingestion-key")
    );

    return response(input.context.requestId, result);
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-media-ingestion/external") {
    const body = await readValidatedJsonBody<ExternalAlarmMediaIngestionRequest>(input.req, externalAlarmMediaIngestionSchema);
    const result = await input.externalAlarmMediaIngestion.ingestReference(
      body,
      input.context.requestId,
      readOptionalHeader(input.req, "x-alarm-media-ingestion-key")
    );

    return response(input.context.requestId, result);
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-ingestion/external/ajax/cloud-cms-stub") {
    const body = await readValidatedJsonBody(input.req, ajaxCloudCmsCollectorStubSchema);
    const result = await input.ajaxCloudCmsCollectorStub.ingest(
      body,
      input.context.requestId,
      readOptionalHeader(input.req, "x-alarm-ingestion-key")
    );

    return response(input.context.requestId, result);
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-ingestion/external/ajax/nvr-8ch") {
    const body = await readValidatedJsonBody(input.req, ajaxNvr8chAlarmIngestionSchema);
    const result = await input.ajaxNvr8chAlarmAdapter.ingest(
      body,
      input.context.requestId,
      readOptionalHeader(input.req, "x-alarm-ingestion-key")
    );

    return response(input.context.requestId, result);
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-ingestion/external/ajax/hub2-4g-jeweller") {
    const body = await readValidatedJsonBody(input.req, ajaxHub2FourGJewellerAlarmIngestionSchema);
    const result = await input.ajaxHub2FourGJewellerAlarmAdapter.ingest(
      body,
      input.context.requestId,
      readOptionalHeader(input.req, "x-alarm-ingestion-key")
    );

    return response(input.context.requestId, result);
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-ingestion/external/dahua/nvr") {
    const body = await readValidatedJsonBody(input.req, dahuaNvrAlarmIngestionSchema);
    const result = await input.dahuaNvrAlarmAdapter.ingest(
      body,
      input.context.requestId,
      readOptionalHeader(input.req, "x-alarm-ingestion-key")
    );

    return response(input.context.requestId, result);
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-ingestion/external/grundig/gu-rn-ac5104n") {
    const body = await readValidatedJsonBody(input.req, grundigGuRnAc5104nAlarmIngestionSchema);
    const result = await input.grundigGuRnAc5104nAlarmAdapter.ingest(
      body,
      input.context.requestId,
      readOptionalHeader(input.req, "x-alarm-ingestion-key")
    );

    return response(input.context.requestId, result);
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-ingestion/external/grundig/gu-series/ip-camera") {
    const body = await readValidatedJsonBody(input.req, grundigGuSeriesIpCameraAlarmIngestionSchema);
    const result = await input.grundigGuSeriesIpCameraAlarmAdapter.ingest(
      body,
      input.context.requestId,
      readOptionalHeader(input.req, "x-alarm-ingestion-key")
    );

    return response(input.context.requestId, result);
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-ingestion/external/axis/ip-camera") {
    const body = await readValidatedJsonBody(input.req, axisIpCameraAlarmIngestionSchema);
    const result = await input.axisIpCameraAlarmAdapter.ingest(
      body,
      input.context.requestId,
      readOptionalHeader(input.req, "x-alarm-ingestion-key")
    );

    return response(input.context.requestId, result);
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-ingestion/external/axis/nvr") {
    const body = await readValidatedJsonBody(input.req, axisNvrAlarmIngestionSchema);
    const result = await input.axisNvrAlarmAdapter.ingest(
      body,
      input.context.requestId,
      readOptionalHeader(input.req, "x-alarm-ingestion-key")
    );

    return response(input.context.requestId, result);
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-ingestion/external/uniview/ip-camera") {
    const body = await readValidatedJsonBody(input.req, univiewIpCameraAlarmIngestionSchema);
    const result = await input.univiewIpCameraAlarmAdapter.ingest(
      body,
      input.context.requestId,
      readOptionalHeader(input.req, "x-alarm-ingestion-key")
    );

    return response(input.context.requestId, result);
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-ingestion/external/hikvision/ip-camera") {
    const body = await readValidatedJsonBody(input.req, hikvisionIpCameraAlarmIngestionSchema);
    const result = await input.hikvisionIpCameraAlarmAdapter.ingest(
      body,
      input.context.requestId,
      readOptionalHeader(input.req, "x-alarm-ingestion-key")
    );

    return response(input.context.requestId, result);
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-ingestion/external/hikvision/nvr") {
    const body = await readValidatedJsonBody(input.req, hikvisionNvrAlarmIngestionSchema);
    const result = await input.hikvisionNvrAlarmAdapter.ingest(
      body,
      input.context.requestId,
      readOptionalHeader(input.req, "x-alarm-ingestion-key")
    );

    return response(input.context.requestId, result);
  }

  if (method === "GET" && url.pathname === "/api/v1/alarm-cases/open") {
    const token = readBearerToken(input.req);
    const filter: AlarmPipelineFilter = readAlarmPipelineFilter(url.searchParams);
    const pipeline = await input.alarmPipeline.listOpenCases(token, filter, input.context.requestId);

    return response(input.context.requestId, pipeline);
  }

  if (method === "GET" && url.pathname === "/api/v1/alarm-cases/archive") {
    const token = readBearerToken(input.req);
    const filter: AlarmArchiveFilter = readAlarmArchiveFilter(url.searchParams);
    const archive = await input.alarmArchive.listCases(token, filter, input.context.requestId);
    return response(input.context.requestId, archive);
  }

  if (method === "GET" && url.pathname === "/api/v1/alarm-catalogs") {
    const token = readBearerToken(input.req);
    const catalogs = await input.alarmCase.getCatalogs(token, input.context.requestId);
    return response(input.context.requestId, catalogs);
  }

  if (method === "GET" && url.pathname === "/api/v1/alarm-workflow-profiles") {
    const token = readBearerToken(input.req);
    const profiles = await input.alarmCase.listWorkflowProfiles(token, readAlarmWorkflowProfileFilter(url.searchParams), input.context.requestId);
    return response(input.context.requestId, { profiles });
  }

  if (method === "POST" && url.pathname === "/api/v1/alarm-workflow-profiles") {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, alarmWorkflowProfileSchema);
    const profile = await input.alarmCase.upsertWorkflowProfile(token, body, input.context.requestId);
    return response(input.context.requestId, { profile });
  }

  if (method === "GET" && url.pathname === "/api/v1/monitoring/disturbances/open") {
    const token = readBearerToken(input.req);
    const filter: MonitoringPipelineFilter = readMonitoringPipelineFilter(url.searchParams);
    const pipeline = await input.monitoring.listOpenDisturbances(token, filter, input.context.requestId);
    return response(input.context.requestId, pipeline);
  }

  const monitoringDetailMatch = url.pathname.match(/^\/api\/v1\/monitoring\/disturbances\/([^/]+)$/);
  if (method === "GET" && monitoringDetailMatch) {
    const token = readBearerToken(input.req);
    const detail = await input.monitoring.getDisturbanceDetail(token, monitoringDetailMatch[1]!, input.context.requestId);
    return response(input.context.requestId, detail);
  }

  const monitoringAcknowledgeMatch = url.pathname.match(/^\/api\/v1\/monitoring\/disturbances\/([^/]+)\/acknowledge$/);
  if (method === "POST" && monitoringAcknowledgeMatch) {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, monitoringDisturbanceAcknowledgeSchema);
    const result = await input.monitoring.acknowledgeDisturbance(token, monitoringAcknowledgeMatch[1]!, body, input.context.requestId);
    return response(input.context.requestId, result);
  }

  const monitoringNoteMatch = url.pathname.match(/^\/api\/v1\/monitoring\/disturbances\/([^/]+)\/notes$/);
  if (method === "POST" && monitoringNoteMatch) {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, monitoringDisturbanceNoteSchema);
    const result = await input.monitoring.addDisturbanceNote(token, monitoringNoteMatch[1]!, body, input.context.requestId);
    return response(input.context.requestId, result);
  }

  const monitoringServiceCaseMatch = url.pathname.match(/^\/api\/v1\/monitoring\/disturbances\/([^/]+)\/service-cases$/);
  if (method === "POST" && monitoringServiceCaseMatch) {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, monitoringServiceCaseCreateSchema);
    const result = await input.monitoring.createServiceCase(token, monitoringServiceCaseMatch[1]!, body, input.context.requestId);
    return response(input.context.requestId, result);
  }

  const detailMatch = url.pathname.match(/^\/api\/v1\/alarm-cases\/([^/]+)$/);
  const caseReportMatch = url.pathname.match(/^\/api\/v1\/alarm-cases\/([^/]+)\/report$/);
  if (method === "GET" && caseReportMatch) {
    const token = readBearerToken(input.req);
    const report = await input.alarmCaseReport.getReport(token, caseReportMatch[1]!, input.context.requestId);
    return response(input.context.requestId, { report });
  }

  const caseExportMatch = url.pathname.match(/^\/api\/v1\/alarm-cases\/([^/]+)\/export$/);
  if (method === "GET" && caseExportMatch) {
    const token = readBearerToken(input.req);
    const document = await input.alarmCaseReport.exportReport(
      token,
      caseExportMatch[1]!,
      readAlarmCaseExportFormat(url.searchParams),
      input.context.requestId
    );
    return response(input.context.requestId, { document });
  }

  const mediaAccessMatch = url.pathname.match(/^\/api\/v1\/alarm-media\/([^/]+)\/access$/);
  if (method === "GET" && mediaAccessMatch) {
    const token = readBearerToken(input.req);
    const document = await input.alarmArchive.getMediaAccess(
      token,
      mediaAccessMatch[1]!,
      readAlarmMediaAccessMode(url.searchParams),
      input.context.requestId
    );
    return response(input.context.requestId, { document });
  }

  const activeMediaAccessMatch = url.pathname.match(/^\/api\/v1\/alarm-cases\/([^/]+)\/media\/([^/]+)\/access$/);
  if (method === "GET" && activeMediaAccessMatch) {
    const token = readBearerToken(input.req);
    const document = await input.alarmCase.getActiveMediaAccess(
      token,
      activeMediaAccessMatch[1]!,
      activeMediaAccessMatch[2]!,
      readAlarmMediaAccessMode(url.searchParams),
      input.context.requestId
    );
    return response(input.context.requestId, { document });
  }

  if (method === "GET" && detailMatch) {
    const token = readBearerToken(input.req);
    const detail = await input.alarmCase.getDetail(token, detailMatch[1]!, input.context.requestId, readAlarmInstructionContext(url.searchParams));
    return response(input.context.requestId, detail);
  }

  const reserveMatch = url.pathname.match(/^\/api\/v1\/alarm-cases\/([^/]+)\/reserve$/);
  if (method === "POST" && reserveMatch) {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, alarmReservationSchema);
    const result = await input.alarmAssignment.reserve(token, reserveMatch[1]!, body, input.context.requestId);
    return response(input.context.requestId, result);
  }

  const releaseMatch = url.pathname.match(/^\/api\/v1\/alarm-cases\/([^/]+)\/release$/);
  if (method === "POST" && releaseMatch) {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, alarmReleaseSchema);
    const result = await input.alarmAssignment.release(token, releaseMatch[1]!, body, input.context.requestId);
    return response(input.context.requestId, result);
  }

  const reassignMatch = url.pathname.match(/^\/api\/v1\/alarm-cases\/([^/]+)\/reassign$/);
  if (method === "POST" && reassignMatch) {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, alarmReservationSchema);
    const result = await input.alarmAssignment.reassign(token, reassignMatch[1]!, body, input.context.requestId);
    return response(input.context.requestId, result);
  }

  const acknowledgeMatch = url.pathname.match(/^\/api\/v1\/alarm-cases\/([^/]+)\/acknowledge$/);
  if (method === "POST" && acknowledgeMatch) {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, alarmAcknowledgeSchema);
    const result = await input.alarmCase.acknowledgeCase(token, acknowledgeMatch[1]!, body, input.context.requestId);
    return response(input.context.requestId, result);
  }

  const assessmentMatch = url.pathname.match(/^\/api\/v1\/alarm-cases\/([^/]+)\/assessment$/);
  if (method === "POST" && assessmentMatch) {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, alarmAssessmentSchema);
    const result = await input.alarmCase.setAssessment(token, assessmentMatch[1]!, body, input.context.requestId);
    return response(input.context.requestId, result);
  }

  const commentMatch = url.pathname.match(/^\/api\/v1\/alarm-cases\/([^/]+)\/comments$/);
  if (method === "POST" && commentMatch) {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, alarmCommentSchema);
    const result = await input.alarmCase.addComment(token, commentMatch[1]!, body, input.context.requestId);
    return response(input.context.requestId, result);
  }

  const followUpMatch = url.pathname.match(/^\/api\/v1\/alarm-cases\/([^/]+)\/follow-up$/);
  if (method === "POST" && followUpMatch) {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, alarmFollowUpSchema);
    const result = await input.alarmCase.updateFollowUp(token, followUpMatch[1]!, body, input.context.requestId);
    return response(input.context.requestId, result);
  }

  const actionMatch = url.pathname.match(/^\/api\/v1\/alarm-cases\/([^/]+)\/actions$/);
  if (method === "POST" && actionMatch) {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, alarmActionSchema);
    const result = await input.alarmCase.documentAction(token, actionMatch[1]!, body, input.context.requestId);
    return response(input.context.requestId, result);
  }

  const closeMatch = url.pathname.match(/^\/api\/v1\/alarm-cases\/([^/]+)\/close$/);
  if (method === "POST" && closeMatch) {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, alarmCloseSchema);
    const result = await input.alarmCase.closeCase(token, closeMatch[1]!, body, input.context.requestId);
    return response(input.context.requestId, result);
  }

  const archiveMatch = url.pathname.match(/^\/api\/v1\/alarm-cases\/([^/]+)\/archive$/);
  if (method === "POST" && archiveMatch) {
    const token = readBearerToken(input.req);
    const body = await readValidatedJsonBody(input.req, alarmArchiveSchema);
    const result = await input.alarmCase.archiveCase(token, archiveMatch[1]!, body, input.context.requestId);
    return response(input.context.requestId, result);
  }

  throw new AppError("Route not found.", {
    status: 404,
    code: "HTTP_ROUTE_NOT_FOUND",
    detail: `${method} ${url.pathname} is not available.`
  });
}

function response(requestId: string, data: unknown): RouteResponse {
  return {
    status: 200,
    body: {
      data,
      meta: {
        requestId
      }
    }
  };
}

function readBearerToken(req: IncomingMessage): string {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError("Bearer token is required.", {
      status: 401,
      code: "AUTH_BEARER_REQUIRED"
    });
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (token.length === 0) {
    throw new AppError("Bearer token is empty.", {
      status: 401,
      code: "AUTH_BEARER_EMPTY"
    });
  }

  return token;
}

function hasRequestBody(req: IncomingMessage): boolean {
  const contentLength = req.headers["content-length"];
  if (!contentLength) {
    return false;
  }
  const parsed = Number(contentLength);
  return Number.isFinite(parsed) && parsed > 0;
}

function readOptionalHeader(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers[name];
  if (typeof header === "string" && header.trim().length > 0) {
    return header.trim();
  }
  return undefined;
}
