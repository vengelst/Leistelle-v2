/**
 * Enthaltet die Frontend-Aktionen fuer Alarm-Pipeline, Falldetails, Medien und Abschlussablaeufe.
 */
import type {
  AlarmCaseDetail,
  AlarmCaseExportDocument,
  AlarmCaseExportFormat,
  AlarmCaseReport,
  AlarmCatalogs,
  AlarmInstructionTimeContext,
  AlarmMediaAccessDocument,
  AlarmMediaAccessMode,
  AlarmPipelineItem,
  AlarmTechnicalState,
  AlarmWorkflowProfile
} from "@leitstelle/contracts";
import type { AppHandlers } from "./events.js";
import type { HandlerRuntime } from "./handler-runtime.js";

import { apiRequest } from "../api.js";
import { state } from "../state.js";
import {
  compactPipelineFilter,
  downloadAccessDocument,
  downloadExportDocument,
  downloadTextDocument,
  escapeHtml,
  normalizeOptionalField,
  parseDateTimeLocalValue,
  openAccessDocument,
  readSelectValue
} from "../utils.js";

type AlarmPipelineUpdateSource = "fetch" | "poll";
type AlarmHandlerDeps = HandlerRuntime & {
  broadcastAlarmSelection?: (alarmCaseId: string) => void;
  handleOpenAlarmPipelineUpdate?: (update: {
    previousItems: AlarmPipelineItem[];
    nextItems: AlarmPipelineItem[];
    source: AlarmPipelineUpdateSource;
  }) => Promise<void> | void;
};

type AlarmLiveRefreshResult = {
  changed: boolean;
  selectedChanged: boolean;
};

export function createAlarmHandlers(
  deps: AlarmHandlerDeps
): Pick<
  AppHandlers,
  | "handlePipelineFilterSubmit"
  | "handlePipelineAssignmentScopeChange"
  | "handlePipelineReset"
  | "handleDetailTimeContextChange"
  | "refreshSelectedDetail"
  | "fetchAlarmReport"
  | "handleDetailReserve"
  | "handleDetailAcknowledge"
  | "handleDetailRelease"
  | "handleQuickConfirm"
  | "handleQuickFalsePositive"
  | "handleIntakeFalseAlarm"
  | "handleArchive"
  | "handleAssessmentSubmit"
  | "handleFollowUpSubmit"
  | "handleFollowUpClear"
  | "handleActionSubmit"
  | "handleCommentSubmit"
  | "handleCloseSubmit"
  | "handleQuickAction"
  | "handleAlarmExport"
  | "handleAlarmPrint"
  | "handleAlarmPrintDownload"
  | "handleAlarmMediaAccess"
  | "handleDetail"
  | "handleOperatorAccept"
  | "handleReserve"
  | "handleRelease"
  | "handleReassign"
  | "fetchWorkflowProfiles"
> & {
  fetchOpenAlarms: (successMessage: string | null) => Promise<void>;
  pollOpenAlarms: () => Promise<AlarmLiveRefreshResult>;
  pollSelectedDetail: () => Promise<boolean>;
  fetchCatalogs: (successMessage: string | null) => Promise<void>;
} {
  function buildOpenAlarmItemSignature(item: AlarmPipelineItem | undefined): string {
    if (!item) {
      return "missing";
    }
    return [
      item.id,
      item.lifecycleStatus,
      item.assessmentStatus,
      item.receivedAt,
      item.lastEventAt,
      item.followUpAt ?? "",
      item.followUpNote ?? "",
      item.responseDueAt ?? "",
      item.responseDeadlineState ?? "",
      item.isEscalationReady ? "1" : "0",
      item.priority,
      item.technicalState,
      item.activeAssignment?.userId ?? "",
      item.activeAssignment?.displayName ?? "",
      item.activeAssignment?.assignmentStatus ?? "",
      item.activeAssignment?.assignedAt ?? ""
    ].join("|");
  }

  function buildOpenAlarmCollectionSignature(items: AlarmPipelineItem[]): string {
    return items.map((item) => buildOpenAlarmItemSignature(item)).join("||");
  }

  function buildSelectedAlarmPipelineSignature(items: AlarmPipelineItem[]): string {
    if (!state.selectedAlarmCaseId) {
      return "none";
    }
    return buildOpenAlarmItemSignature(items.find((item) => item.id === state.selectedAlarmCaseId));
  }

  function buildSelectedAlarmDetailPath(alarmCaseId: string): string {
    const query = new URLSearchParams();
    if (state.selectedInstructionTimeContext) {
      query.set("timeContext", state.selectedInstructionTimeContext);
    }
    return query.size > 0 ? `/api/v1/alarm-cases/${alarmCaseId}?${query.toString()}` : `/api/v1/alarm-cases/${alarmCaseId}`;
  }

  function buildAlarmDetailSignature(detail: AlarmCaseDetail | null): string {
    if (!detail) {
      return "none";
    }
    const activeAssignment = detail.assignments.find((assignment) => assignment.releasedAt === null);
    return [
      detail.alarmCase.id,
      detail.alarmCase.lifecycleStatus,
      detail.alarmCase.assessmentStatus,
      detail.alarmCase.updatedAt,
      detail.alarmCase.resolvedAt ?? "",
      detail.alarmCase.archivedAt ?? "",
      detail.alarmCase.followUpAt ?? "",
      detail.alarmCase.followUpNote ?? "",
      detail.alarmCase.responseDueAt ?? "",
      detail.alarmCase.responseDeadlineState ?? "",
      detail.alarmCase.isEscalationReady ? "1" : "0",
      detail.events.length,
      detail.actions.length,
      detail.comments.length,
      detail.media.length,
      detail.instructionContext.timeContext,
      activeAssignment?.userId ?? "",
      activeAssignment?.assignmentStatus ?? "",
      activeAssignment?.assignedAt ?? ""
    ].join("|");
  }

  function buildMediaAccessPath(detail: AlarmCaseDetail | null, mediaId: string, mode: AlarmMediaAccessMode): string {
    if (detail && !detail.isArchived && detail.media.some((media) => media.id === mediaId)) {
      return `/api/v1/alarm-cases/${detail.alarmCase.id}/media/${mediaId}/access?mode=${encodeURIComponent(mode)}`;
    }
    return `/api/v1/alarm-media/${mediaId}/access?mode=${encodeURIComponent(mode)}`;
  }

  function selectNextOpenAlarmCaseId(): string | undefined {
    return state.openAlarms
      .slice()
      .sort((left, right) => {
        const receivedDiff = new Date(left.receivedAt).getTime() - new Date(right.receivedAt).getTime();
        if (receivedDiff !== 0) {
          return receivedDiff;
        }
        return new Date(left.lastEventAt).getTime() - new Date(right.lastEventAt).getTime();
      })[0]?.id;
  }

  async function setFalsePositiveAndClose(alarmCaseId: string): Promise<void> {
    const reasonId = state.catalogs?.falsePositiveReasons[0]?.id;
    const closureReasonId = state.catalogs?.closureReasons[0]?.id;
    if (!reasonId) {
      throw new Error("Kein Fehlalarmgrund verfuegbar.");
    }
    if (!closureReasonId) {
      throw new Error("Kein Abschlussgrund verfuegbar.");
    }

    await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/assessment`, {
      method: "POST",
      body: JSON.stringify({
        assessmentStatus: "false_positive",
        falsePositiveReasonIds: [reasonId]
      })
    });
    await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/close`, {
      method: "POST",
      body: JSON.stringify({
        closureReasonId,
        comment: "Alarm wurde im Eingangsscreen als Fehlalarm geschlossen."
      })
    });
  }

  function retainSelectedAlarmMediaPreviewState(detail: AlarmCaseDetail | null): void {
    if (!detail || detail.isArchived) {
      state.selectedAlarmMediaPreviews = {};
      state.selectedAlarmMediaPreviewErrors = {};
      return;
    }

    const snapshotIds = detail.media
      .filter((media) => media.mediaKind === "snapshot" || media.mimeType?.startsWith("image/"))
      .slice(0, 3)
      .map((media) => media.id);
    const clipId = detail.media.find((media) => media.mediaKind === "clip" || media.mimeType?.startsWith("video/"))?.id;
    const visibleIds = new Set(clipId ? [...snapshotIds, clipId] : snapshotIds);
    state.selectedAlarmMediaPreviews = Object.fromEntries(
      Object.entries(state.selectedAlarmMediaPreviews).filter(([mediaId]) => visibleIds.has(mediaId))
    );
    state.selectedAlarmMediaPreviewErrors = Object.fromEntries(
      Object.entries(state.selectedAlarmMediaPreviewErrors).filter(([mediaId]) => visibleIds.has(mediaId))
    );
  }

  async function syncSelectedAlarmMediaPreviews(detail: AlarmCaseDetail | null): Promise<void> {
    retainSelectedAlarmMediaPreviewState(detail);
    if (!detail || detail.isArchived) {
      return;
    }

    const snapshotMedia = detail.media.filter((media) => media.mediaKind === "snapshot" || media.mimeType?.startsWith("image/")).slice(0, 3);
    const clipMedia = detail.media.find((media) => media.mediaKind === "clip" || media.mimeType?.startsWith("video/"));
    const previewMedia = clipMedia ? [...snapshotMedia, clipMedia] : snapshotMedia;
    const missingMedia = previewMedia.filter((media) =>
      state.selectedAlarmMediaPreviews[media.id] === undefined && state.selectedAlarmMediaPreviewErrors[media.id] === undefined
    );

    if (missingMedia.length === 0) {
      return;
    }

    await Promise.all(
      missingMedia.map(async (media) => {
        try {
          const response = await apiRequest<{ document: AlarmMediaAccessDocument }>(
            buildMediaAccessPath(detail, media.id, "inline"),
            { method: "GET" }
          );
          state.selectedAlarmMediaPreviews = {
            ...state.selectedAlarmMediaPreviews,
            [media.id]: response.document
          };
        } catch (error) {
          state.selectedAlarmMediaPreviewErrors = {
            ...state.selectedAlarmMediaPreviewErrors,
            [media.id]: error instanceof Error ? error.message : "Medienvorschau konnte nicht geladen werden."
          };
        }
      })
    );
  }

  async function ensureImagePreviewSources(detail: AlarmCaseDetail): Promise<string[]> {
    const imageMedia = detail.media
      .filter((media) => media.mediaKind === "snapshot" || media.mimeType?.startsWith("image/"))
      .slice(0, 3);
    const sources: string[] = [];

    for (const media of imageMedia) {
      const existingPreview = state.selectedAlarmMediaPreviews[media.id];
      if (existingPreview?.mimeType.startsWith("image/")) {
        sources.push(`data:${existingPreview.mimeType};base64,${existingPreview.contentBase64}`);
        continue;
      }

      if (media.storageKey.startsWith("data:image/")) {
        sources.push(media.storageKey);
        continue;
      }

      if (media.storageKey.startsWith("http://") || media.storageKey.startsWith("https://")) {
        try {
          const response = await fetch(media.storageKey, { method: "GET" });
          if (!response.ok) {
            continue;
          }
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === "string") {
                resolve(reader.result);
              } else {
                reject(new Error("Bild konnte nicht als Data-URL gelesen werden."));
              }
            };
            reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
            reader.readAsDataURL(blob);
          });
          sources.push(dataUrl);
          continue;
        } catch {
          // Bei externen Quellen ohne CORS/Erreichbarkeit faellt dieses Bild fuer die Druckdatei aus.
          continue;
        }
      }

      try {
        const response = await apiRequest<{ document: AlarmMediaAccessDocument }>(
          buildMediaAccessPath(detail, media.id, "inline"),
          { method: "GET" }
        );
        const preview = response.document;
        state.selectedAlarmMediaPreviews = {
          ...state.selectedAlarmMediaPreviews,
          [media.id]: preview
        };
        if (preview.mimeType.startsWith("image/")) {
          sources.push(`data:${preview.mimeType};base64,${preview.contentBase64}`);
        }
      } catch {
        // Einzelne fehlende Bilder sollen den Druck nicht komplett verhindern.
      }
    }

    return sources;
  }

  function buildAlarmPrintHtml(detail: AlarmCaseDetail, report: AlarmCaseReport | null, imageSources: string[]): string {
    const alarmCase = detail.alarmCase;
    const site = state.overview?.sites.find((entry) => entry.id === alarmCase.siteId);
    const activeAssignment = detail.assignments.find((entry) => entry.assignmentStatus === "active");
    const rows = [
      ["Alarm-ID", alarmCase.id],
      ["Titel", alarmCase.title],
      ["Standort", site?.siteName ?? alarmCase.siteId],
      ["Kunde", site?.customer.name ?? "-"],
      ["Adresse", site ? `${site.address.street}, ${site.address.postalCode} ${site.address.city}, ${site.address.country}` : "-"],
      ["Alarmtyp", alarmCase.alarmType],
      ["Prioritaet", alarmCase.priority],
      ["Status", alarmCase.lifecycleStatus],
      ["Bewertung", alarmCase.assessmentStatus],
      ["Empfangen", alarmCase.receivedAt],
      ["Geoeffnet am", alarmCase.firstOpenedAt ?? activeAssignment?.assignedAt ?? "-"],
      ["Bearbeitet von", activeAssignment?.userId ?? "-"]
    ];

    return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Druckansicht ${escapeHtml(alarmCase.id)}</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 24px; color: #1d2a2f; }
    h1, h2 { margin: 0 0 10px 0; }
    .meta { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .meta td { border: 1px solid #d9d9d9; padding: 6px 8px; vertical-align: top; }
    .images { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 14px 0; }
    .images img { width: 100%; height: auto; border: 1px solid #d9d9d9; border-radius: 4px; }
    .section { margin-top: 14px; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <h1>Alarmdruck ${escapeHtml(alarmCase.id)}</h1>
  <table class="meta">
    ${rows.map(([label, value]) => `<tr><td><strong>${escapeHtml(String(label ?? ""))}</strong></td><td>${escapeHtml(String(value ?? "-"))}</td></tr>`).join("")}
  </table>
  <h2>Bilder</h2>
  <div class="images">
    ${imageSources.length > 0
      ? imageSources.map((src, index) => `<figure><img src="${escapeHtml(src)}" alt="Alarmbild ${index + 1}" /></figure>`).join("")
      : "<p>Keine Bildvorschau verfuegbar.</p>"}
  </div>
  <div class="section">
    <h2>Zusammenfassung</h2>
    <p>${escapeHtml(report?.narrative.overview.join(" ") ?? "Keine zusaetzliche Zusammenfassung vorhanden.")}</p>
  </div>
</body>
</html>`;
  }


  function syncSelectedAlarmCase(items: AlarmPipelineItem[]): void {
    if (state.selectedAlarmDetail) {
      state.selectedAlarmCaseId = state.selectedAlarmDetail.alarmCase.id;
      return;
    }

    if (state.selectedAlarmCaseId && !items.some((item) => item.id === state.selectedAlarmCaseId)) {
      delete state.selectedAlarmCaseId;
    }
  }

  async function loadOpenAlarmsIntoStateForSource(source: AlarmPipelineUpdateSource): Promise<AlarmLiveRefreshResult> {
    const previousItems = state.openAlarms;
    const previousListSignature = buildOpenAlarmCollectionSignature(state.openAlarms);
    const previousSelectedSignature = buildSelectedAlarmPipelineSignature(state.openAlarms);
    const query = new URLSearchParams();
    if (state.pipelineFilter.siteId) query.set("siteId", state.pipelineFilter.siteId);
    if (state.pipelineFilter.technicalState) query.set("technicalState", state.pipelineFilter.technicalState);
    const path = query.size > 0 ? `/api/v1/alarm-cases/open?${query.toString()}` : "/api/v1/alarm-cases/open";
    const response = await apiRequest<{ items: AlarmPipelineItem[] }>(path, { method: "GET" });
    const nextListSignature = buildOpenAlarmCollectionSignature(response.items);
    const nextSelectedSignature = buildSelectedAlarmPipelineSignature(response.items);

    if (nextListSignature !== previousListSignature) {
      state.openAlarms = response.items;
      syncSelectedAlarmCase(response.items);
    }

    await deps.handleOpenAlarmPipelineUpdate?.({
      previousItems,
      nextItems: response.items,
      source
    });

    return {
      changed: nextListSignature !== previousListSignature,
      selectedChanged: nextSelectedSignature !== previousSelectedSignature
    };
  }

  async function fetchOpenAlarms(successMessage: string | null): Promise<void> {
    deps.setBusyState("open-alarms", "Alarm-Pipeline wird geladen");
    try {
      await loadOpenAlarmsIntoStateForSource("fetch");
      deps.setSuccess(successMessage);
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Offene Alarme konnten nicht geladen werden.");
    } finally {
      deps.setBusyState("open-alarms", null);
    }
  }

  async function fetchCatalogs(successMessage: string | null): Promise<void> {
    deps.setBusyState("catalogs", "Kataloge werden geladen");
    try {
      state.catalogs = await apiRequest<AlarmCatalogs>("/api/v1/alarm-catalogs", { method: "GET" });
      deps.setSuccess(successMessage);
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Alarmkataloge konnten nicht geladen werden.");
    } finally {
      deps.setBusyState("catalogs", null);
    }
  }

  async function fetchWorkflowProfiles(successMessage: string | null): Promise<void> {
    deps.setBusyState("workflow-profiles", "Einsatzanweisungen werden geladen");
    try {
      const response = await apiRequest<{ profiles: AlarmWorkflowProfile[] }>("/api/v1/alarm-workflow-profiles", { method: "GET" });
      state.workflowProfiles = response.profiles;
      deps.setSuccess(successMessage);
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Einsatzanweisungen konnten nicht geladen werden.");
    } finally {
      deps.setBusyState("workflow-profiles", null);
    }
  }

  async function fetchAlarmReport(successMessage: string | null): Promise<void> {
    if (!state.selectedAlarmDetail) return;
    deps.setBusyState("alarm-report", "Fallbericht wird geladen");
    try {
      const response = await apiRequest<{ report: AlarmCaseReport }>(`/api/v1/alarm-cases/${state.selectedAlarmDetail.alarmCase.id}/report`, { method: "GET" });
      state.selectedAlarmReport = response.report;
      deps.setSuccess(successMessage);
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Fallbericht konnte nicht geladen werden.");
    } finally {
      deps.setBusyState("alarm-report", null);
    }
  }

  async function handleDetail(alarmCaseId: string): Promise<void> {
    if (!alarmCaseId) return;
    state.selectedAlarmCaseId = alarmCaseId;
    deps.broadcastAlarmSelection?.(alarmCaseId);
    deps.setBusyState("alarm-detail", "Alarmkontext wird geladen");
    try {
      await deps.runRenderBatch(async () => {
        const query = new URLSearchParams();
        if (state.selectedInstructionTimeContext) {
          query.set("timeContext", state.selectedInstructionTimeContext);
        }
        const path = query.size > 0 ? `/api/v1/alarm-cases/${alarmCaseId}?${query.toString()}` : `/api/v1/alarm-cases/${alarmCaseId}`;
        const detail = await apiRequest<AlarmCaseDetail>(path, { method: "GET" });
        state.selectedAlarmDetail = detail;
        state.selectedMonitoringDetail = null;
        delete state.selectedMonitoringDisturbanceId;
        state.selectedInstructionTimeContext = detail.instructionContext.timeContext;
        await Promise.all([
          fetchAlarmReport(null),
          syncSelectedAlarmMediaPreviews(detail)
        ]);
        deps.setSuccess("Alarmkontext geladen.");
      });
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Alarmkontext konnte nicht geladen werden.");
    } finally {
      deps.setBusyState("alarm-detail", null);
    }
  }

  async function refreshSelectedDetail(successMessage: string | null): Promise<void> {
    if (!state.selectedAlarmDetail) return;
    deps.setBusyState("alarm-detail-refresh", "Alarmkontext wird aktualisiert");
    try {
      await deps.runRenderBatch(async () => {
        const path = buildSelectedAlarmDetailPath(state.selectedAlarmDetail!.alarmCase.id);
        const detail = await apiRequest<AlarmCaseDetail>(path, { method: "GET" });
        state.selectedAlarmDetail = detail;
        state.selectedAlarmCaseId = detail.alarmCase.id;
        state.selectedInstructionTimeContext = detail.instructionContext.timeContext;
        await Promise.all([
          fetchAlarmReport(null),
          syncSelectedAlarmMediaPreviews(detail)
        ]);
        deps.setSuccess(successMessage);
      });
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Alarmkontext konnte nicht aktualisiert werden.");
    } finally {
      deps.setBusyState("alarm-detail-refresh", null);
    }
  }

  async function pollOpenAlarms(): Promise<AlarmLiveRefreshResult> {
    return await loadOpenAlarmsIntoStateForSource("poll");
  }

  async function pollSelectedDetail(): Promise<boolean> {
    if (!state.selectedAlarmDetail) {
      return false;
    }

    const previousSignature = buildAlarmDetailSignature(state.selectedAlarmDetail);
    const detail = await apiRequest<AlarmCaseDetail>(buildSelectedAlarmDetailPath(state.selectedAlarmDetail.alarmCase.id), {
      method: "GET"
    });
    const nextSignature = buildAlarmDetailSignature(detail);
    if (nextSignature === previousSignature) {
      return false;
    }

    state.selectedAlarmDetail = detail;
    state.selectedAlarmCaseId = detail.alarmCase.id;
    state.selectedInstructionTimeContext = detail.instructionContext.timeContext;
    await Promise.all([
      fetchAlarmReport(null),
      syncSelectedAlarmMediaPreviews(detail)
    ]);
    return true;
  }

  async function handleReserve(alarmCaseId: string, options?: { override?: boolean }): Promise<void> {
    if (!alarmCaseId) return;
    deps.setBusyState("alarm-reserve", "Alarm wird reserviert");
    try {
      const queueItem = state.openAlarms.find((item) => item.id === alarmCaseId);
      const currentUserId = state.session?.user.id;
      const canOverride = state.session?.user.roles.some((role) => role === "administrator" || role === "leitstellenleiter") ?? false;
      const shouldOverride = options?.override === true
        || Boolean(queueItem?.activeAssignment && queueItem.activeAssignment.userId !== currentUserId && canOverride);
      await reserveAlarmCase(alarmCaseId, shouldOverride ? "Alarm per Override uebernommen." : "Alarm reserviert.", {
        override: shouldOverride
      });
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Reservierung fehlgeschlagen.");
    } finally {
      deps.setBusyState("alarm-reserve", null);
    }
  }

  async function handleRelease(alarmCaseId: string): Promise<void> {
    if (!alarmCaseId) return;
    deps.setBusyState("alarm-release", "Alarm wird freigegeben");
    try {
      await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/release`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await fetchOpenAlarms("Alarm freigegeben.");
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Freigabe fehlgeschlagen.");
    } finally {
      deps.setBusyState("alarm-release", null);
    }
  }

  async function reserveAlarmCase(alarmCaseId: string, successMessage: string | null, options?: { override?: boolean }): Promise<void> {
    await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/reserve`, {
      method: "POST",
      body: JSON.stringify(options?.override ? { override: true } : {})
    });
    await fetchOpenAlarms(successMessage);
  }

  async function acknowledgeAlarmCase(alarmCaseId: string, successMessage: string | null): Promise<void> {
    await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({})
    });
    await fetchOpenAlarms(null);
    await refreshSelectedDetail(successMessage);
  }

  return {
    fetchOpenAlarms,
    pollOpenAlarms,
    pollSelectedDetail,
    fetchCatalogs,
    fetchWorkflowProfiles,
    async handlePipelineFilterSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      const siteId = normalizeOptionalField(formData.get("siteId"));
      const technicalState = normalizeOptionalField(formData.get("technicalState")) as AlarmTechnicalState | undefined;
      const lifecycleScope = normalizeOptionalField(formData.get("lifecycleScope")) as import("../state.js").PipelineLifecycleScope | undefined;
      const assignmentScope = normalizeOptionalField(formData.get("assignmentScope")) as import("../state.js").PipelineAssignmentScope | undefined;
      state.pipelineFilter = compactPipelineFilter({
        ...(siteId ? { siteId } : {}),
        ...(technicalState ? { technicalState } : {}),
        ...(lifecycleScope ? { lifecycleScope } : {}),
        ...(assignmentScope ? { assignmentScope } : {})
      });
      await fetchOpenAlarms("Pipeline geladen.");
    },
    handlePipelineAssignmentScopeChange(scope: string): void {
      const nextScope = scope === "mine" || scope === "unassigned" ? scope : "all";
      state.pipelineFilter = compactPipelineFilter(
        nextScope === "all"
          ? {
              ...state.pipelineFilter
            }
          : {
              ...state.pipelineFilter,
              assignmentScope: nextScope
            }
      );
      if (nextScope === "all") {
        delete state.pipelineFilter.assignmentScope;
      }
      deps.render();
    },
    async handlePipelineReset(): Promise<void> {
      state.pipelineFilter = {};
      await fetchOpenAlarms("Pipeline geladen.");
    },
    handleDetail,
    refreshSelectedDetail,
    fetchAlarmReport,
    async handleAlarmExport(format: AlarmCaseExportFormat): Promise<void> {
      if (!state.selectedAlarmDetail) return;
      try {
        const response = await apiRequest<{ document: AlarmCaseExportDocument }>(
          `/api/v1/alarm-cases/${state.selectedAlarmDetail.alarmCase.id}/export?format=${encodeURIComponent(format)}`,
          { method: "GET" }
        );
        downloadExportDocument(response.document);
        state.message = `${format} exportiert.`;
        state.error = null;
      } catch (error) {
        state.error = error instanceof Error ? error.message : "Export konnte nicht erzeugt werden.";
        state.message = null;
      }
      deps.render();
    },
    async handleAlarmPrint(): Promise<void> {
      const detail = state.selectedAlarmDetail;
      if (!detail) {
        return;
      }
      try {
        const imageSources = await ensureImagePreviewSources(detail);
        const report = state.selectedAlarmReport;
        const alarmCase = detail.alarmCase;
        const html = buildAlarmPrintHtml(detail, report, imageSources);
        const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1100,height=900");
        if (!printWindow) {
          throw new Error("Druckfenster konnte nicht geoeffnet werden (Popup-Blocker pruefen).");
        }
        printWindow.document.open();
        printWindow.document.write(`${html}<script>window.focus();window.print();</script>`);
        printWindow.document.close();
        state.message = "Druckansicht geoeffnet. Alternativ kann PDF Download genutzt werden.";
        state.error = null;
      } catch (error) {
        state.error = error instanceof Error ? error.message : "Druckansicht konnte nicht erstellt werden.";
        state.message = null;
      }
      deps.render();
    },
    async handleAlarmPrintDownload(): Promise<void> {
      const detail = state.selectedAlarmDetail;
      if (!detail) {
        return;
      }
      try {
        const imageSources = await ensureImagePreviewSources(detail);
        const html = buildAlarmPrintHtml(detail, state.selectedAlarmReport, imageSources);
        downloadTextDocument(`${detail.alarmCase.id}-druckansicht.html`, html, "text/html;charset=utf-8");
        state.message = "Druckdatei heruntergeladen.";
        state.error = null;
      } catch (error) {
        state.error = error instanceof Error ? error.message : "Druckdatei konnte nicht erzeugt werden.";
        state.message = null;
      }
      deps.render();
    },
    async handleAlarmMediaAccess(mediaId: string, mode: AlarmMediaAccessMode): Promise<void> {
      if (!mediaId) return;
      try {
        const response = await apiRequest<{ document: AlarmMediaAccessDocument }>(
          buildMediaAccessPath(state.selectedAlarmDetail, mediaId, mode),
          { method: "GET" }
        );
        if (mode === "inline" && state.leitstelleMode === "alarms") {
          state.selectedAlarmMediaPreviews = {
            ...state.selectedAlarmMediaPreviews,
            [mediaId]: response.document
          };
          state.message = "Medienvorschau aktualisiert.";
        } else if (mode === "inline") {
          openAccessDocument(response.document);
          state.message = "Medienvorschau geoeffnet.";
        } else {
          downloadAccessDocument(response.document);
          state.message = "Medienreferenz heruntergeladen.";
        }
        state.error = null;
      } catch (error) {
        state.error = error instanceof Error ? error.message : "Medienzugriff fehlgeschlagen.";
        state.message = null;
      }
      deps.render();
    },
    async handleDetailTimeContextChange(event: Event): Promise<void> {
      const select = event.currentTarget;
      if (!(select instanceof HTMLSelectElement)) return;
      state.selectedInstructionTimeContext = select.value as AlarmInstructionTimeContext;
      if (state.selectedAlarmDetail) {
        await handleDetail(state.selectedAlarmDetail.alarmCase.id);
      }
    },
    async handleDetailReserve(): Promise<void> {
      if (!state.selectedAlarmDetail) return;
      await deps.runRenderBatch(async () => {
        const activeAssignment = state.selectedAlarmDetail?.assignments.find((assignment) => assignment.assignmentStatus === "active");
        const currentUserId = state.session?.user.id;
        const canOverride = state.session?.user.roles.some((role) => role === "administrator" || role === "leitstellenleiter") ?? false;
        await handleReserve(state.selectedAlarmDetail!.alarmCase.id, {
          override: Boolean(activeAssignment && activeAssignment.userId !== currentUserId && canOverride)
        });
        await refreshSelectedDetail("Alarm reserviert.");
      });
    },
    async handleDetailAcknowledge(): Promise<void> {
      if (!state.selectedAlarmDetail) return;
      const alarmCaseId = state.selectedAlarmDetail.alarmCase.id;
      const currentUserId = state.session?.user.id;
      const canOverride = state.session?.user.roles.some((role) => role === "administrator" || role === "leitstellenleiter") ?? false;
      const activeAssignment = state.selectedAlarmDetail.assignments.find((assignment) => assignment.releasedAt === undefined);
      deps.setBusyState("alarm-acknowledge", "Alarm wird quittiert");
      try {
        await deps.runRenderBatch(async () => {
          if (!activeAssignment) {
            await reserveAlarmCase(alarmCaseId, null);
          }
          const refreshedAssignment = state.openAlarms.find((item) => item.id === alarmCaseId)?.activeAssignment;
          if (refreshedAssignment && refreshedAssignment.userId !== currentUserId && !canOverride) {
            throw new Error("Alarm ist bereits einem anderen Operator zugewiesen.");
          }
          await acknowledgeAlarmCase(alarmCaseId, "Alarm quittiert und in Bearbeitung gesetzt.");
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Alarm konnte nicht quittiert werden.");
      } finally {
        deps.setBusyState("alarm-acknowledge", null);
      }
    },
    async handleDetailRelease(): Promise<void> {
      if (!state.selectedAlarmDetail) return;
      await deps.runRenderBatch(async () => {
        await handleRelease(state.selectedAlarmDetail!.alarmCase.id);
        await refreshSelectedDetail("Alarm freigegeben.");
      });
    },
    handleReserve,
    async handleOperatorAccept(alarmCaseId: string): Promise<void> {
      if (!alarmCaseId) return;
      const currentUserId = state.session?.user.id;
      const queueItem = state.openAlarms.find((item) => item.id === alarmCaseId);
      const isAlreadyMine = queueItem?.activeAssignment?.userId === currentUserId;
      const canOverride = state.session?.user.roles.some((role) => role === "administrator" || role === "leitstellenleiter") ?? false;
      const shouldOverride = Boolean(queueItem?.activeAssignment && !isAlreadyMine && canOverride);
      deps.setBusyState("alarm-operator-accept", "Alarm wird in den Bearbeitungskontext uebernommen");
      try {
        await deps.runRenderBatch(async () => {
          if (!queueItem?.activeAssignment || !isAlreadyMine) {
            await reserveAlarmCase(alarmCaseId, null, shouldOverride ? { override: true } : undefined);
          }
          await handleDetail(alarmCaseId);
          deps.setSuccess(isAlreadyMine ? "Alarmkontext geoeffnet." : shouldOverride ? "Alarm per Override uebernommen und geoeffnet." : "Alarm uebernommen und geoeffnet.");
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Alarm konnte nicht uebernommen werden.");
      } finally {
        deps.setBusyState("alarm-operator-accept", null);
      }
    },
    handleRelease,
    async handleReassign(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const alarmCaseId = form.dataset.alarmCaseId ?? "";
      if (!alarmCaseId) return;
      const formData = new FormData(form);
      const targetUserId = normalizeOptionalField(formData.get("targetUserId"));
      if (!targetUserId) {
        deps.setFailure("targetUserId ist fuer das Umhaengen erforderlich.");
        deps.render();
        return;
      }
      deps.setBusyState("alarm-reassign", "Alarm wird umgehaengt");
      try {
        await apiRequest(`/api/v1/alarm-cases/${alarmCaseId}/reassign`, {
          method: "POST",
          body: JSON.stringify({
            targetUserId,
            reason: normalizeOptionalField(formData.get("reason")),
            override: String(formData.get("override") ?? "false") === "true"
          })
        });
        await fetchOpenAlarms("Alarm umgehaengt.");
        if (state.selectedAlarmDetail?.alarmCase.id === alarmCaseId) {
          await refreshSelectedDetail("Alarm umgehaengt.");
        }
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Umhaengen fehlgeschlagen.");
      } finally {
        deps.setBusyState("alarm-reassign", null);
      }
    },
    async handleAssessmentSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement) || !state.selectedAlarmDetail) return;
      const formData = new FormData(form);
      const assessmentStatus = readSelectValue(formData, "assessmentStatus", ["pending", "confirmed_incident", "false_positive"] as const);
      const falsePositiveReasonId = normalizeOptionalField(formData.get("falsePositiveReasonId"));
      deps.setBusyState("alarm-assessment", "Bewertung wird gespeichert");
      try {
        await deps.runRenderBatch(async () => {
          await apiRequest(`/api/v1/alarm-cases/${state.selectedAlarmDetail!.alarmCase.id}/assessment`, {
            method: "POST",
            body: JSON.stringify({
              assessmentStatus,
              ...(assessmentStatus === "false_positive" && falsePositiveReasonId ? { falsePositiveReasonIds: [falsePositiveReasonId] } : {})
            })
          });
          await fetchOpenAlarms(null);
          await refreshSelectedDetail("Bewertung gespeichert.");
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Bewertung konnte nicht gespeichert werden.");
      } finally {
        deps.setBusyState("alarm-assessment", null);
      }
    },
    async handleFollowUpSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement) || !state.selectedAlarmDetail) return;
      const formData = new FormData(form);
      const followUpAt = parseDateTimeLocalValue(formData.get("followUpAt"));
      if (!followUpAt) {
        deps.setFailure("Bitte einen gueltigen Wiedervorlagezeitpunkt angeben.");
        deps.render();
        return;
      }
      deps.setBusyState("alarm-follow-up", "Wiedervorlage wird gespeichert");
      try {
        await deps.runRenderBatch(async () => {
          await apiRequest(`/api/v1/alarm-cases/${state.selectedAlarmDetail!.alarmCase.id}/follow-up`, {
            method: "POST",
            body: JSON.stringify({
              followUpAt,
              note: normalizeOptionalField(formData.get("note"))
            })
          });
          await fetchOpenAlarms(null);
          await refreshSelectedDetail("Wiedervorlage gespeichert.");
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Wiedervorlage konnte nicht gespeichert werden.");
      } finally {
        deps.setBusyState("alarm-follow-up", null);
      }
    },
    async handleFollowUpClear(): Promise<void> {
      if (!state.selectedAlarmDetail?.alarmCase.followUpAt) {
        return;
      }
      if (!window.confirm("Aktive Wiedervorlage wirklich entfernen?")) {
        return;
      }
      deps.setBusyState("alarm-follow-up", "Wiedervorlage wird entfernt");
      try {
        await deps.runRenderBatch(async () => {
          await apiRequest(`/api/v1/alarm-cases/${state.selectedAlarmDetail!.alarmCase.id}/follow-up`, {
            method: "POST",
            body: JSON.stringify({ clear: true })
          });
          await fetchOpenAlarms(null);
          await refreshSelectedDetail("Wiedervorlage entfernt.");
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Wiedervorlage konnte nicht entfernt werden.");
      } finally {
        deps.setBusyState("alarm-follow-up", null);
      }
    },
    async handleQuickConfirm(): Promise<void> {
      if (!state.selectedAlarmDetail) return;
      deps.setBusyState("alarm-assessment", "Bewertung wird gesetzt");
      try {
        await deps.runRenderBatch(async () => {
          await apiRequest(`/api/v1/alarm-cases/${state.selectedAlarmDetail!.alarmCase.id}/assessment`, {
            method: "POST",
            body: JSON.stringify({ assessmentStatus: "confirmed_incident" })
          });
          await fetchOpenAlarms(null);
          await refreshSelectedDetail("Bewertung auf Vorfall gesetzt.");
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Bewertung konnte nicht gesetzt werden.");
      } finally {
        deps.setBusyState("alarm-assessment", null);
      }
    },
    async handleQuickFalsePositive(): Promise<void> {
      if (!state.selectedAlarmDetail) return;
      const reasonId = state.catalogs?.falsePositiveReasons[0]?.id;
      if (!reasonId) {
        deps.setFailure("Kein Fehlalarmgrund verfuegbar.");
        deps.render();
        return;
      }
      if (!window.confirm("Alarm als Fehlalarm markieren?")) {
        return;
      }
      deps.setBusyState("alarm-assessment", "Bewertung wird gesetzt");
      try {
        await deps.runRenderBatch(async () => {
          await apiRequest(`/api/v1/alarm-cases/${state.selectedAlarmDetail!.alarmCase.id}/assessment`, {
            method: "POST",
            body: JSON.stringify({ assessmentStatus: "false_positive", falsePositiveReasonIds: [reasonId] })
          });
          await fetchOpenAlarms(null);
          await refreshSelectedDetail("Bewertung auf Fehlalarm gesetzt.");
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Bewertung konnte nicht gesetzt werden.");
      } finally {
        deps.setBusyState("alarm-assessment", null);
      }
    },
    async handleIntakeFalseAlarm(alarmCaseId: string): Promise<void> {
      if (!alarmCaseId) {
        return;
      }
      if (state.falseAlarmCloseMode === "confirm" && !window.confirm("Alarm als Fehlalarm setzen, schliessen und den naechsten Alarm oeffnen?")) {
        return;
      }
      deps.setBusyState("alarm-intake-false-positive", "Fehlalarm wird geschlossen");
      try {
        await deps.runRenderBatch(async () => {
          await setFalsePositiveAndClose(alarmCaseId);
          await fetchOpenAlarms(null);
          const nextAlarmCaseId = selectNextOpenAlarmCaseId();
          if (nextAlarmCaseId) {
            await handleDetail(nextAlarmCaseId);
            deps.setSuccess("Als Fehlalarm geschlossen. Naechster Alarm geoeffnet.");
            return;
          }

          state.selectedAlarmDetail = null;
          state.selectedAlarmReport = null;
          delete state.selectedAlarmCaseId;
          state.selectedAlarmMediaPreviews = {};
          state.selectedAlarmMediaPreviewErrors = {};
          deps.setSuccess("Als Fehlalarm geschlossen. Keine weiteren offenen Alarme.");
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Fehlalarm konnte nicht geschlossen werden.");
      } finally {
        deps.setBusyState("alarm-intake-false-positive", null);
      }
    },
    async handleActionSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement) || !state.selectedAlarmDetail) return;
      const formData = new FormData(form);
      deps.setBusyState("alarm-action", "Massnahme wird gespeichert");
      try {
        await deps.runRenderBatch(async () => {
          await apiRequest(`/api/v1/alarm-cases/${state.selectedAlarmDetail!.alarmCase.id}/actions`, {
            method: "POST",
            body: JSON.stringify({
              actionTypeId: String(formData.get("actionTypeId") ?? ""),
              statusId: String(formData.get("statusId") ?? ""),
              comment: String(formData.get("comment") ?? "")
            })
          });
          form.reset();
          await refreshSelectedDetail("Massnahme dokumentiert.");
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Massnahme konnte nicht dokumentiert werden.");
      } finally {
        deps.setBusyState("alarm-action", null);
      }
    },
    async handleQuickAction(actionTypeId: string): Promise<void> {
      if (!state.selectedAlarmDetail || !actionTypeId) return;
      const completedStatusId = state.catalogs?.actionStatuses.find((entry) => entry.code === "completed")?.id;
      const actionType = state.catalogs?.actionTypes.find((entry) => entry.id === actionTypeId);
      if (!completedStatusId || !actionType) {
        deps.setFailure("Massnahmenkatalog nicht verfuegbar.");
        deps.render();
        return;
      }
      deps.setBusyState("alarm-action", "Schnellaktion wird dokumentiert");
      try {
        await deps.runRenderBatch(async () => {
          await apiRequest(`/api/v1/alarm-cases/${state.selectedAlarmDetail!.alarmCase.id}/actions`, {
            method: "POST",
            body: JSON.stringify({
              actionTypeId,
              statusId: completedStatusId,
              comment: `${actionType.label} dokumentiert.`
            })
          });
          await refreshSelectedDetail(`${actionType.label} dokumentiert.`);
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Schnellaktion fehlgeschlagen.");
      } finally {
        deps.setBusyState("alarm-action", null);
      }
    },
    async handleCommentSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement) || !state.selectedAlarmDetail) return;
      const formData = new FormData(form);
      deps.setBusyState("alarm-comment", "Kommentar wird gespeichert");
      try {
        await deps.runRenderBatch(async () => {
          await apiRequest(`/api/v1/alarm-cases/${state.selectedAlarmDetail!.alarmCase.id}/comments`, {
            method: "POST",
            body: JSON.stringify({
              body: String(formData.get("body") ?? ""),
              commentKind: "operator_note"
            })
          });
          form.reset();
          await refreshSelectedDetail("Kommentar gespeichert.");
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Kommentar konnte nicht gespeichert werden.");
      } finally {
        deps.setBusyState("alarm-comment", null);
      }
    },
    async handleCloseSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement) || !state.selectedAlarmDetail) return;
      const formData = new FormData(form);
      if (!window.confirm("Alarmfall wirklich schliessen?")) {
        return;
      }
      deps.setBusyState("alarm-close", "Alarmfall wird geschlossen");
      try {
        await deps.runRenderBatch(async () => {
          await apiRequest(`/api/v1/alarm-cases/${state.selectedAlarmDetail!.alarmCase.id}/close`, {
            method: "POST",
            body: JSON.stringify({
              closureReasonId: String(formData.get("closureReasonId") ?? ""),
              comment: normalizeOptionalField(formData.get("comment"))
            })
          });
          await fetchOpenAlarms(null);
          await refreshSelectedDetail("Alarmfall geschlossen.");
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Alarmfall konnte nicht geschlossen werden.");
      } finally {
        deps.setBusyState("alarm-close", null);
      }
    },
    async handleArchive(): Promise<void> {
      if (!state.selectedAlarmDetail) return;
      if (!window.confirm("Alarmfall wirklich archivieren?")) {
        return;
      }
      deps.setBusyState("alarm-archive", "Alarmfall wird archiviert");
      try {
        await deps.runRenderBatch(async () => {
          await apiRequest(`/api/v1/alarm-cases/${state.selectedAlarmDetail!.alarmCase.id}/archive`, {
            method: "POST",
            body: JSON.stringify({})
          });
          await fetchOpenAlarms(null);
          await refreshSelectedDetail("Alarmfall archiviert.");
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Alarmfall konnte nicht archiviert werden.");
      } finally {
        deps.setBusyState("alarm-archive", null);
      }
    }
  };
}
