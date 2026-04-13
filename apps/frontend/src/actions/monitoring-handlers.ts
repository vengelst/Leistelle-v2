import type {
  MonitoringDisturbanceDetail,
  MonitoringPipelineItem,
  MonitoringPriority,
  SiteTechnicalOverallStatus
} from "@leitstelle/contracts";
import type { AppHandlers } from "./events.js";
import type { HandlerRuntime } from "./handler-runtime.js";

import { apiRequest } from "../api.js";
import { state } from "../state.js";
import { compactMonitoringFilter, normalizeOptionalField } from "../utils.js";

type MonitoringHandlerDeps = HandlerRuntime;

type MonitoringLiveRefreshResult = {
  changed: boolean;
  selectedChanged: boolean;
};

export function createMonitoringHandlers(
  deps: MonitoringHandlerDeps
): Pick<
  AppHandlers,
  | "handleMonitoringFilterSubmit"
  | "handleMonitoringReset"
  | "refreshSelectedMonitoringDetail"
  | "handleMonitoringDetail"
  | "handleMonitoringAcknowledge"
  | "handleMonitoringAcknowledgeSelected"
  | "handleMonitoringNoteSubmit"
  | "handleMonitoringServiceCaseSubmit"
> & {
  fetchOpenDisturbances: (successMessage: string | null) => Promise<void>;
  pollOpenDisturbances: () => Promise<MonitoringLiveRefreshResult>;
  pollSelectedMonitoringDetail: () => Promise<boolean>;
} {
  function buildDisturbanceItemSignature(item: MonitoringPipelineItem | undefined): string {
    if (!item) {
      return "missing";
    }

    return [
      item.id,
      item.status,
      item.priority,
      item.siteTechnicalStatus,
      item.startedAt,
      String(item.durationSeconds),
      item.latestEventAt ?? "",
      item.lastNote ?? "",
      item.serviceCaseId ?? "",
      item.serviceCaseStatus ?? "",
      item.referenceLabel ?? "",
      item.deviceId ?? "",
      item.checkTargetId ?? ""
    ].join("|");
  }

  function buildDisturbanceCollectionSignature(items: MonitoringPipelineItem[]): string {
    return items.map((item) => buildDisturbanceItemSignature(item)).join("||");
  }

  function buildSelectedDisturbancePipelineSignature(items: MonitoringPipelineItem[]): string {
    if (!state.selectedMonitoringDisturbanceId) {
      return "none";
    }
    return buildDisturbanceItemSignature(items.find((item) => item.id === state.selectedMonitoringDisturbanceId));
  }

  function buildDisturbanceDetailSignature(detail: MonitoringDisturbanceDetail | null): string {
    if (!detail) {
      return "none";
    }

    return [
      detail.disturbance.id,
      detail.disturbance.status,
      detail.disturbance.priority,
      detail.disturbance.updatedAt,
      detail.disturbance.endedAt ?? "",
      detail.site.technicalStatus,
      detail.site.technicalStatusUpdatedAt,
      detail.device?.id ?? "",
      detail.checkTarget?.id ?? "",
      detail.serviceCase?.id ?? "",
      detail.serviceCase?.status ?? "",
      String(detail.history.length),
      String(detail.notes.length)
    ].join("|");
  }

  function syncSelectedMonitoringDisturbance(items: MonitoringPipelineItem[]): void {
    if (state.selectedMonitoringDetail) {
      state.selectedMonitoringDisturbanceId = state.selectedMonitoringDetail.disturbance.id;
      return;
    }

    if (state.selectedMonitoringDisturbanceId && !items.some((item) => item.id === state.selectedMonitoringDisturbanceId)) {
      delete state.selectedMonitoringDisturbanceId;
    }
  }

  async function loadOpenDisturbancesIntoState(): Promise<MonitoringLiveRefreshResult> {
    const previousListSignature = buildDisturbanceCollectionSignature(state.openDisturbances);
    const previousSelectedSignature = buildSelectedDisturbancePipelineSignature(state.openDisturbances);
    const query = new URLSearchParams();
    if (state.monitoringFilter.siteId) query.set("siteId", state.monitoringFilter.siteId);
    if (state.monitoringFilter.priority) query.set("priority", state.monitoringFilter.priority);
    if (state.monitoringFilter.siteTechnicalStatus) query.set("siteTechnicalStatus", state.monitoringFilter.siteTechnicalStatus);
    const path = query.size > 0 ? `/api/v1/monitoring/disturbances/open?${query.toString()}` : "/api/v1/monitoring/disturbances/open";
    const response = await apiRequest<{ items: MonitoringPipelineItem[] }>(path, { method: "GET" });
    const nextListSignature = buildDisturbanceCollectionSignature(response.items);
    const nextSelectedSignature = buildSelectedDisturbancePipelineSignature(response.items);

    if (nextListSignature !== previousListSignature) {
      state.openDisturbances = response.items;
      syncSelectedMonitoringDisturbance(response.items);
    }

    return {
      changed: nextListSignature !== previousListSignature,
      selectedChanged: nextSelectedSignature !== previousSelectedSignature
    };
  }

  async function fetchOpenDisturbances(successMessage: string | null): Promise<void> {
    deps.setBusyState("open-disturbances", "Stoerungspipeline wird geladen");
    try {
      await loadOpenDisturbancesIntoState();
      deps.setSuccess(successMessage);
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Technische Stoerungen konnten nicht geladen werden.");
    } finally {
      deps.setBusyState("open-disturbances", null);
    }
  }

  async function pollOpenDisturbances(): Promise<MonitoringLiveRefreshResult> {
    return await loadOpenDisturbancesIntoState();
  }

  async function pollSelectedMonitoringDetail(): Promise<boolean> {
    if (!state.selectedMonitoringDetail) {
      return false;
    }

    const previousSignature = buildDisturbanceDetailSignature(state.selectedMonitoringDetail);
    const detail = await apiRequest<MonitoringDisturbanceDetail>(
      `/api/v1/monitoring/disturbances/${state.selectedMonitoringDetail.disturbance.id}`,
      { method: "GET" }
    );
    const nextSignature = buildDisturbanceDetailSignature(detail);
    if (nextSignature === previousSignature) {
      return false;
    }

    state.selectedMonitoringDetail = detail;
    state.selectedMonitoringDisturbanceId = detail.disturbance.id;
    return true;
  }

  async function handleMonitoringDetail(disturbanceId: string): Promise<void> {
    if (!disturbanceId) return;
    state.selectedMonitoringDisturbanceId = disturbanceId;
    deps.setBusyState("monitoring-detail", "Stoerungsdetail wird geladen");
    try {
      await deps.runRenderBatch(async () => {
        const detail = await apiRequest<MonitoringDisturbanceDetail>(`/api/v1/monitoring/disturbances/${disturbanceId}`, { method: "GET" });
        state.selectedMonitoringDetail = detail;
        state.selectedAlarmDetail = null;
        state.selectedAlarmReport = null;
        delete state.selectedAlarmCaseId;
        deps.setSuccess("Stoerungsdetail geladen.");
      });
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Stoerungsdetail konnte nicht geladen werden.");
    } finally {
      deps.setBusyState("monitoring-detail", null);
    }
  }

  async function refreshSelectedMonitoringDetail(successMessage: string | null): Promise<void> {
    if (!state.selectedMonitoringDetail) return;
    deps.setBusyState("monitoring-detail-refresh", "Stoerungsdetail wird aktualisiert");
    try {
      await deps.runRenderBatch(async () => {
        const detail = await apiRequest<MonitoringDisturbanceDetail>(
          `/api/v1/monitoring/disturbances/${state.selectedMonitoringDetail!.disturbance.id}`,
          { method: "GET" }
        );
        state.selectedMonitoringDetail = detail;
        state.selectedMonitoringDisturbanceId = detail.disturbance.id;
        deps.setSuccess(successMessage);
      });
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Stoerungsdetail konnte nicht aktualisiert werden.");
    } finally {
      deps.setBusyState("monitoring-detail-refresh", null);
    }
  }

  async function handleMonitoringAcknowledge(disturbanceId: string): Promise<void> {
    if (!disturbanceId) return;
    deps.setBusyState("monitoring-ack", "Stoerung wird quittiert");
    try {
      await deps.runRenderBatch(async () => {
        await apiRequest(`/api/v1/monitoring/disturbances/${disturbanceId}/acknowledge`, {
          method: "POST",
          body: JSON.stringify({})
        });
        await fetchOpenDisturbances("Stoerung quittiert.");
        if (state.selectedMonitoringDetail?.disturbance.id === disturbanceId) {
          await refreshSelectedMonitoringDetail("Stoerung quittiert.");
        }
      });
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Stoerung konnte nicht quittiert werden.");
    } finally {
      deps.setBusyState("monitoring-ack", null);
    }
  }

  return {
    fetchOpenDisturbances,
    pollOpenDisturbances,
    pollSelectedMonitoringDetail,
    async handleMonitoringFilterSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      const siteId = normalizeOptionalField(formData.get("siteId"));
      const priority = normalizeOptionalField(formData.get("priority")) as MonitoringPriority | undefined;
      const siteTechnicalStatus = normalizeOptionalField(formData.get("siteTechnicalStatus")) as SiteTechnicalOverallStatus | undefined;
      state.monitoringFilter = compactMonitoringFilter({
        ...(siteId ? { siteId } : {}),
        ...(priority ? { priority } : {}),
        ...(siteTechnicalStatus ? { siteTechnicalStatus } : {})
      });
      await fetchOpenDisturbances("Stoerungspipeline geladen.");
    },
    async handleMonitoringReset(): Promise<void> {
      state.monitoringFilter = {};
      await fetchOpenDisturbances("Stoerungspipeline geladen.");
    },
    handleMonitoringDetail,
    refreshSelectedMonitoringDetail,
    handleMonitoringAcknowledge,
    async handleMonitoringAcknowledgeSelected(): Promise<void> {
      if (!state.selectedMonitoringDetail) return;
      await handleMonitoringAcknowledge(state.selectedMonitoringDetail.disturbance.id);
    },
    async handleMonitoringNoteSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement) || !state.selectedMonitoringDetail) return;
      const formData = new FormData(form);
      deps.setBusyState("monitoring-note", "Stoerungsnotiz wird gespeichert");
      try {
        await deps.runRenderBatch(async () => {
          await apiRequest(`/api/v1/monitoring/disturbances/${state.selectedMonitoringDetail!.disturbance.id}/notes`, {
            method: "POST",
            body: JSON.stringify({ note: String(formData.get("note") ?? "") })
          });
          form.reset();
          await fetchOpenDisturbances(null);
          await refreshSelectedMonitoringDetail("Stoerungsnotiz gespeichert.");
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Stoerungsnotiz konnte nicht gespeichert werden.");
      } finally {
        deps.setBusyState("monitoring-note", null);
      }
    },
    async handleMonitoringServiceCaseSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement) || !state.selectedMonitoringDetail) return;
      const formData = new FormData(form);
      deps.setBusyState("monitoring-service-case", "Servicefall wird angelegt");
      try {
        await deps.runRenderBatch(async () => {
          await apiRequest(`/api/v1/monitoring/disturbances/${state.selectedMonitoringDetail!.disturbance.id}/service-cases`, {
            method: "POST",
            body: JSON.stringify({ comment: String(formData.get("comment") ?? "") })
          });
          form.reset();
          await fetchOpenDisturbances(null);
          await refreshSelectedMonitoringDetail("Servicefall angelegt.");
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Servicefall konnte nicht angelegt werden.");
      } finally {
        deps.setBusyState("monitoring-service-case", null);
      }
    }
  };
}
