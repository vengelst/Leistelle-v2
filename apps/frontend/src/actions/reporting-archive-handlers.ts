/**
 * Kapselt Frontend-Aktionen fuer Reportingfilter, Archivsuche und Exportausloeser.
 */
import type {
  AlarmArchiveFilter,
  AlarmArchiveResult,
  AlarmType,
  MonitoringDisturbanceType,
  ReportingGroupDimension,
  ReportingOverview
} from "@leitstelle/contracts";
import type { AppHandlers } from "./events.js";
import type { HandlerRuntime } from "./handler-runtime.js";

import { apiRequest } from "../api.js";
import { buildArchiveExportCsv, buildReportingExportCsv } from "../archive-reporting-export.js";
import { archiveLifecycleScopeOptions, archivePeriodOptions, defaultArchiveFilter, defaultReportingFilter, reportingPeriodOptions, state } from "../state.js";
import { downloadTextDocument, normalizeOptionalField, readSelectValue } from "../utils.js";

type ReportingArchiveHandlerDeps = HandlerRuntime;

export function createReportingArchiveHandlers(deps: ReportingArchiveHandlerDeps): Pick<
  AppHandlers,
  "handleReportingFilterSubmit" | "handleReportingReset" | "handleReportingExport" | "handleArchiveFilterSubmit" | "handleArchiveReset" | "handleArchiveExport"
> & {
  fetchReporting: (successMessage: string | null) => Promise<void>;
  fetchArchiveCases: (successMessage: string | null) => Promise<void>;
} {
  async function fetchReporting(successMessage: string | null): Promise<void> {
    deps.setBusyState("reporting", "Reporting wird geladen");
    try {
      const query = new URLSearchParams();
      query.set("period", state.reportingFilter.period);
      if (state.reportingFilter.dateFrom) query.set("dateFrom", state.reportingFilter.dateFrom);
      if (state.reportingFilter.dateTo) query.set("dateTo", state.reportingFilter.dateTo);
      if (state.reportingFilter.customerId) query.set("customerId", state.reportingFilter.customerId);
      if (state.reportingFilter.siteId) query.set("siteId", state.reportingFilter.siteId);
      if (state.reportingFilter.cameraId) query.set("cameraId", state.reportingFilter.cameraId);
      if (state.reportingFilter.alarmType) query.set("alarmType", state.reportingFilter.alarmType);
      if (state.reportingFilter.operatorUserId) query.set("operatorUserId", state.reportingFilter.operatorUserId);
      if (state.reportingFilter.disturbanceType) query.set("disturbanceType", state.reportingFilter.disturbanceType);
      if (state.reportingFilter.groupBy) query.set("groupBy", state.reportingFilter.groupBy);
      const response = await apiRequest<{ overview: ReportingOverview }>(`/api/v1/reporting/overview?${query.toString()}`, { method: "GET" });
      state.reporting = response.overview;
      deps.setSuccess(successMessage);
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Reporting konnte nicht geladen werden.");
    } finally {
      deps.setBusyState("reporting", null);
    }
  }

  async function fetchArchiveCases(successMessage: string | null): Promise<void> {
    if (!state.session?.user.roles.some((role) => role === "administrator" || role === "leitstellenleiter" || role === "operator")) {
      state.archive = null;
      return;
    }
    deps.setBusyState("archive", "Archiv wird geladen");
    try {
      const query = new URLSearchParams();
      query.set("period", state.archiveFilter.period);
      if (state.archiveFilter.dateFrom) query.set("dateFrom", state.archiveFilter.dateFrom);
      if (state.archiveFilter.dateTo) query.set("dateTo", state.archiveFilter.dateTo);
      if (state.archiveFilter.lifecycleScope) query.set("lifecycleScope", state.archiveFilter.lifecycleScope);
      if (state.archiveFilter.customerId) query.set("customerId", state.archiveFilter.customerId);
      if (state.archiveFilter.siteId) query.set("siteId", state.archiveFilter.siteId);
      if (state.archiveFilter.cameraId) query.set("cameraId", state.archiveFilter.cameraId);
      if (state.archiveFilter.alarmType) query.set("alarmType", state.archiveFilter.alarmType);
      if (state.archiveFilter.assessmentStatus) query.set("assessmentStatus", state.archiveFilter.assessmentStatus);
      if (state.archiveFilter.operatorUserId) query.set("operatorUserId", state.archiveFilter.operatorUserId);
      if (state.archiveFilter.closureReasonId) query.set("closureReasonId", state.archiveFilter.closureReasonId);
      if (state.archiveFilter.disturbanceType) query.set("disturbanceType", state.archiveFilter.disturbanceType);
      state.archive = await apiRequest<AlarmArchiveResult>(`/api/v1/alarm-cases/archive?${query.toString()}`, { method: "GET" });
      deps.setSuccess(successMessage);
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Archiv konnte nicht geladen werden.");
    } finally {
      deps.setBusyState("archive", null);
    }
  }

  return {
    fetchReporting,
    fetchArchiveCases,
    async handleReportingFilterSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      const period = readSelectValue(formData, "period", reportingPeriodOptions);
      const groupBy = normalizeOptionalField(formData.get("groupBy")) as ReportingGroupDimension | undefined;
      const customerId = normalizeOptionalField(formData.get("customerId"));
      const siteId = normalizeOptionalField(formData.get("siteId"));
      const cameraId = normalizeOptionalField(formData.get("cameraId"));
      const alarmType = normalizeOptionalField(formData.get("alarmType")) as AlarmType | undefined;
      const disturbanceType = normalizeOptionalField(formData.get("disturbanceType")) as MonitoringDisturbanceType | undefined;
      const operatorUserId = normalizeOptionalField(formData.get("operatorUserId"));
      const dateFrom = normalizeOptionalField(formData.get("dateFrom"));
      const dateTo = normalizeOptionalField(formData.get("dateTo"));

      state.reportingFilter = {
        period,
        ...(groupBy ? { groupBy } : {}),
        ...(customerId ? { customerId } : {}),
        ...(siteId ? { siteId } : {}),
        ...(cameraId ? { cameraId } : {}),
        ...(alarmType ? { alarmType } : {}),
        ...(disturbanceType ? { disturbanceType } : {}),
        ...(operatorUserId ? { operatorUserId } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {})
      };

      await fetchReporting("Reporting geladen.");
    },
    async handleReportingReset(): Promise<void> {
      state.reportingFilter = { ...defaultReportingFilter };
      await fetchReporting("Reporting geladen.");
    },
    handleReportingExport(): void {
      if (!state.reporting) {
        deps.setFailure("Es liegt noch keine Reporting-Auswertung fuer den Export vor.");
        deps.render();
        return;
      }

      downloadTextDocument(
        `reporting-${state.reporting.range.period}-${new Date().toISOString().slice(0, 10)}.csv`,
        buildReportingExportCsv(state.reporting),
        "text/csv;charset=utf-8"
      );
      deps.setSuccess("Reporting-Export erstellt.");
      deps.render();
    },
    async handleArchiveFilterSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      const period = readSelectValue(formData, "period", archivePeriodOptions);
      const lifecycleScope = readSelectValue(formData, "lifecycleScope", archiveLifecycleScopeOptions);
      const customerId = normalizeOptionalField(formData.get("customerId"));
      const siteId = normalizeOptionalField(formData.get("siteId"));
      const cameraId = normalizeOptionalField(formData.get("cameraId"));
      const alarmType = normalizeOptionalField(formData.get("alarmType")) as AlarmType | undefined;
      const assessmentStatus = normalizeOptionalField(formData.get("assessmentStatus")) as AlarmArchiveFilter["assessmentStatus"];
      const closureReasonId = normalizeOptionalField(formData.get("closureReasonId"));
      const disturbanceType = normalizeOptionalField(formData.get("disturbanceType")) as MonitoringDisturbanceType | undefined;
      const operatorUserId = normalizeOptionalField(formData.get("operatorUserId"));
      const dateFrom = normalizeOptionalField(formData.get("dateFrom"));
      const dateTo = normalizeOptionalField(formData.get("dateTo"));

      state.archiveFilter = {
        period,
        lifecycleScope,
        ...(customerId ? { customerId } : {}),
        ...(siteId ? { siteId } : {}),
        ...(cameraId ? { cameraId } : {}),
        ...(alarmType ? { alarmType } : {}),
        ...(assessmentStatus ? { assessmentStatus } : {}),
        ...(closureReasonId ? { closureReasonId } : {}),
        ...(disturbanceType ? { disturbanceType } : {}),
        ...(operatorUserId ? { operatorUserId } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {})
      };

      await fetchArchiveCases("Archiv geladen.");
    },
    async handleArchiveReset(): Promise<void> {
      state.archiveFilter = { ...defaultArchiveFilter };
      await fetchArchiveCases("Archiv geladen.");
    },
    handleArchiveExport(): void {
      if (!state.archive) {
        deps.setFailure("Es liegen noch keine Archivdaten fuer den Export vor.");
        deps.render();
        return;
      }

      downloadTextDocument(
        `archivliste-${state.archive.filters.period}-${new Date().toISOString().slice(0, 10)}.csv`,
        buildArchiveExportCsv(state.archive),
        "text/csv;charset=utf-8"
      );
      deps.setSuccess("Archivliste exportiert.");
      deps.render();
    }
  };
}
