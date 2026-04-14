import type {
  AlarmSourceMappingUpsertInput,
  AlarmWorkflowProfile,
  CustomerUpsertInput,
  DeviceType,
  DeviceUpsertInput,
  MasterDataOverview,
  SiteDevice,
  SiteMapMarkerCollection,
  SiteUpsertInput
} from "@leitstelle/contracts";
import type { AppHandlers } from "./events.js";
import type { HandlerRuntime } from "./handler-runtime.js";

import { apiRequest } from "../api.js";
import { deviceTypeOptions, planKindOptions, siteStatusOptions, state } from "../state.js";
import { normalizeOptionalField, readSelectValue } from "../utils.js";

type MasterDataHandlerDeps = HandlerRuntime & {
  fetchOpenAlarms: (successMessage: string | null) => Promise<void>;
  fetchSiteMarkers: (successMessage: string | null) => Promise<void>;
  fetchWorkflowProfiles: (successMessage: string | null) => Promise<void>;
};

export function createMasterDataHandlers(
  deps: MasterDataHandlerDeps
): Pick<
  AppHandlers,
  | "fetchOverview"
  | "handleGlobalSettingsSubmit"
  | "handleCustomerSubmit"
  | "handleSiteSubmit"
  | "handleSiteManagementToggleArchive"
  | "handleDeviceSubmit"
  | "handleSiteManagementDeleteDevice"
  | "handleAlarmSourceMappingSubmit"
  | "handleSiteManagementToggleAlarmSourceMapping"
  | "handlePlanSubmit"
  | "handleWorkflowProfileSubmit"
> {
  function getSectionForDeviceType(type: DeviceType): "technology" | "network" | "audio" {
    if (type === "router") {
      return "network";
    }
    if (type === "speaker") {
      return "audio";
    }
    return "technology";
  }

  function normalizeSelectedSitePlans(overview: MasterDataOverview): void {
    const nextSelectedPlanIds: Record<string, string> = {};
    const nextSelectedPlanMarkerIds: Record<string, string> = {};

    for (const site of overview.sites) {
      if (site.plans.length === 0) {
        continue;
      }

      const currentSelection = state.selectedSitePlanIds[site.id];
      const resolvedPlanId = site.plans.some((plan) => plan.id === currentSelection)
        ? currentSelection
        : site.plans[0]?.id;

      if (resolvedPlanId) {
        nextSelectedPlanIds[site.id] = resolvedPlanId;
        const selectedPlan = site.plans.find((plan) => plan.id === resolvedPlanId);
        if (selectedPlan?.markers.length) {
          const currentMarkerId = state.selectedSitePlanMarkerIds[resolvedPlanId];
          const resolvedMarkerId = selectedPlan.markers.some((marker) => marker.id === currentMarkerId)
            ? currentMarkerId
            : selectedPlan.markers[0]?.id;
          if (resolvedMarkerId) {
            nextSelectedPlanMarkerIds[resolvedPlanId] = resolvedMarkerId;
          }
        }
      }
    }

    state.selectedSitePlanIds = nextSelectedPlanIds;
    state.selectedSitePlanMarkerIds = nextSelectedPlanMarkerIds;
  }

  function normalizeSelectedSiteManagement(overview: MasterDataOverview): void {
    const availableSiteIds = new Set(overview.sites.map((site) => site.id));
    const preferredSiteId = state.selectedSiteId ?? state.selectedMapSiteId;
    const resolvedSiteId = preferredSiteId && availableSiteIds.has(preferredSiteId)
      ? preferredSiteId
      : overview.sites[0]?.id;

    if (resolvedSiteId) {
      state.selectedSiteId = resolvedSiteId;
    } else {
      delete state.selectedSiteId;
    }

    if (state.selectedMapSiteId && !availableSiteIds.has(state.selectedMapSiteId)) {
      delete state.selectedMapSiteId;
    }
    if (state.selectedSiteEditorId && !availableSiteIds.has(state.selectedSiteEditorId)) {
      delete state.selectedSiteEditorId;
    }

    const deviceById = new Map<string, SiteDevice>();
    for (const site of overview.sites) {
      for (const device of site.devices) {
        deviceById.set(device.id, device);
      }
    }

    if (state.selectedDeviceEditorId) {
      const selectedDevice = deviceById.get(state.selectedDeviceEditorId);
      if (selectedDevice) {
        state.siteManagementDeviceDraftType = selectedDevice.type;
        state.selectedSiteId = selectedDevice.siteId;
      } else {
        delete state.selectedDeviceEditorId;
      }
    }

    const availableMappingIds = new Set(
      overview.sites.flatMap((site) => site.alarmSourceMappings.map((mapping) => mapping.id))
    );
    if (state.selectedAlarmSourceMappingEditorId && !availableMappingIds.has(state.selectedAlarmSourceMappingEditorId)) {
      delete state.selectedAlarmSourceMappingEditorId;
    }
  }

  function buildSiteUpsertPayloadFromSite(
    site: MasterDataOverview["sites"][number],
    overrides?: Partial<SiteUpsertInput>
  ): SiteUpsertInput {
    return {
      id: site.id,
      customerId: site.customer.id,
      siteName: site.siteName,
      ...(site.internalReference ? { internalReference: site.internalReference } : {}),
      ...(site.description ? { description: site.description } : {}),
      status: site.status,
      street: site.address.street,
      ...(site.address.houseNumber ? { houseNumber: site.address.houseNumber } : {}),
      postalCode: site.address.postalCode,
      city: site.address.city,
      country: site.address.country,
      ...(site.coordinates ? { latitude: site.coordinates.latitude, longitude: site.coordinates.longitude } : {}),
      ...(site.siteType ? { siteType: site.siteType } : {}),
      ...(site.contactPerson ? { contactPerson: site.contactPerson } : {}),
      ...(site.contactPhone ? { contactPhone: site.contactPhone } : {}),
      ...(site.notes ? { notes: site.notes } : {}),
      isArchived: site.isArchived,
      monitoringIntervalSeconds: site.settings.monitoringIntervalSeconds,
      failureThreshold: site.settings.failureThreshold,
      highlightCriticalDevices: site.settings.highlightCriticalDevices,
      defaultAlarmPriority: site.settings.defaultAlarmPriority,
      defaultWorkflowProfile: site.settings.defaultWorkflowProfile,
      mapLabelMode: site.settings.mapLabelMode,
      ...overrides
    };
  }

  async function submitMasterData(
    path: string,
    body: Record<string, unknown>,
    successMessage: string,
    options?: {
      refreshOpenAlarms?: boolean;
      refreshSiteMarkers?: boolean;
      resetForm?: HTMLFormElement;
      afterSuccess?: (overview: MasterDataOverview) => void;
    }
  ): Promise<void> {
    deps.setBusyState("master-data-save", "Stammdaten werden gespeichert");
    try {
      await deps.runRenderBatch(async () => {
        const response = await apiRequest<{ overview: MasterDataOverview }>(path, { method: "POST", body: JSON.stringify(body) });
        state.overview = response.overview;
        normalizeSelectedSitePlans(response.overview);
        normalizeSelectedSiteManagement(response.overview);
        options?.afterSuccess?.(response.overview);
        if (options?.refreshSiteMarkers) {
          await deps.fetchSiteMarkers(null);
        }
        deps.setSuccess(successMessage);
        if (options?.refreshOpenAlarms) {
          await deps.fetchOpenAlarms(null);
        }
        options?.resetForm?.reset();
      });
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Stammdaten konnten nicht gespeichert werden.");
    } finally {
      deps.setBusyState("master-data-save", null);
    }
  }

  return {
    async fetchOverview(successMessage: string | null): Promise<void> {
      deps.setBusyState("overview", "Stammdaten werden geladen");
      try {
        const response = await apiRequest<{ overview: MasterDataOverview }>("/api/v1/master-data/overview", { method: "GET" });
        state.overview = response.overview;
        normalizeSelectedSitePlans(response.overview);
        normalizeSelectedSiteManagement(response.overview);
        deps.setSuccess(successMessage);
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Stammdaten konnten nicht geladen werden.");
      } finally {
        deps.setBusyState("overview", null);
      }
    },
    async handleGlobalSettingsSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      await submitMasterData("/api/v1/master-data/global-settings", {
        monitoringIntervalSeconds: Number(formData.get("monitoringIntervalSeconds") ?? 90),
        failureThreshold: Number(formData.get("failureThreshold") ?? 3),
        uiDensity: readSelectValue(formData, "uiDensity", ["comfortable", "compact"] as const),
        escalationProfile: readSelectValue(formData, "escalationProfile", ["standard", "elevated"] as const),
        workflowProfile: readSelectValue(formData, "workflowProfile", ["default", "weekend_sensitive"] as const),
        passwordMinLength: Number(formData.get("passwordMinLength") ?? 8),
        kioskCodeLength: Number(formData.get("kioskCodeLength") ?? 6)
      }, "Globale Einstellungen gespeichert.");
    },
    async handleCustomerSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      const externalRef = normalizeOptionalField(formData.get("externalRef"));
      const payload: CustomerUpsertInput = {
        name: String(formData.get("name") ?? ""),
        isActive: String(formData.get("isActive") ?? "true") === "true",
        ...(externalRef ? { externalRef } : {})
      };
      await submitMasterData("/api/v1/master-data/customers", payload, "Customer gespeichert.", {
        refreshOpenAlarms: true,
        resetForm: form
      });
    },
    async handleSiteSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      const siteId = normalizeOptionalField(formData.get("id"));
      const payload: SiteUpsertInput = {
        ...(siteId ? { id: siteId } : {}),
        customerId: String(formData.get("customerId") ?? ""),
        siteName: String(formData.get("siteName") ?? ""),
        ...(normalizeOptionalField(formData.get("internalReference"))
          ? { internalReference: String(normalizeOptionalField(formData.get("internalReference"))) }
          : {}),
        ...(normalizeOptionalField(formData.get("description"))
          ? { description: String(normalizeOptionalField(formData.get("description"))) }
          : {}),
        status: readSelectValue(formData, "status", siteStatusOptions),
        street: String(formData.get("street") ?? ""),
        ...(normalizeOptionalField(formData.get("houseNumber"))
          ? { houseNumber: String(normalizeOptionalField(formData.get("houseNumber"))) }
          : {}),
        postalCode: String(formData.get("postalCode") ?? ""),
        city: String(formData.get("city") ?? ""),
        country: String(formData.get("country") ?? ""),
        ...(normalizeOptionalField(formData.get("latitude")) ? { latitude: Number(formData.get("latitude")) } : {}),
        ...(normalizeOptionalField(formData.get("longitude")) ? { longitude: Number(formData.get("longitude")) } : {}),
        ...(normalizeOptionalField(formData.get("siteType"))
          ? { siteType: String(normalizeOptionalField(formData.get("siteType"))) }
          : {}),
        ...(normalizeOptionalField(formData.get("contactPerson"))
          ? { contactPerson: String(normalizeOptionalField(formData.get("contactPerson"))) }
          : {}),
        ...(normalizeOptionalField(formData.get("contactPhone"))
          ? { contactPhone: String(normalizeOptionalField(formData.get("contactPhone"))) }
          : {}),
        ...(normalizeOptionalField(formData.get("notes"))
          ? { notes: String(normalizeOptionalField(formData.get("notes"))) }
          : {}),
        isArchived: String(formData.get("isArchived") ?? "false") === "true",
        monitoringIntervalSeconds: Number(formData.get("monitoringIntervalSeconds") ?? 120),
        failureThreshold: Number(formData.get("failureThreshold") ?? 4),
        highlightCriticalDevices: String(formData.get("highlightCriticalDevices") ?? "true") === "true",
        defaultAlarmPriority: readSelectValue(formData, "defaultAlarmPriority", ["normal", "high", "critical"] as const),
        defaultWorkflowProfile: readSelectValue(formData, "defaultWorkflowProfile", ["default", "event_sensitive"] as const),
        mapLabelMode: readSelectValue(formData, "mapLabelMode", ["short", "full"] as const)
      };
      await submitMasterData("/api/v1/master-data/sites", payload, "Standort gespeichert.", {
        refreshOpenAlarms: true,
        refreshSiteMarkers: true,
        resetForm: form,
        afterSuccess(overview) {
          delete state.selectedSiteEditorId;
          state.siteManagementCreateSiteMode = false;
          const selectedSite = overview.sites.find((site) =>
            siteId ? site.id === siteId : site.siteName === payload.siteName && site.customer.id === payload.customerId
          );
          if (selectedSite) {
            state.selectedSiteId = selectedSite.id;
            state.selectedMapSiteId = selectedSite.id;
            state.siteManagementView = "detail";
          }
          state.selectedSiteManagementSection = "overview";
        }
      });
    },
    async handleSiteManagementToggleArchive(siteId: string): Promise<void> {
      if (!state.overview) {
        deps.setFailure("Standortdaten sind noch nicht geladen.");
        return;
      }

      const selectedSite = state.overview.sites.find((site) => site.id === siteId);
      if (!selectedSite) {
        deps.setFailure("Standort konnte nicht gefunden werden.");
        return;
      }

      const nextArchivedState = !selectedSite.isArchived;
      const confirmMessage = nextArchivedState
        ? `Standort "${selectedSite.siteName}" wirklich archivieren?`
        : `Standort "${selectedSite.siteName}" wirklich reaktivieren?`;

      if (!window.confirm(confirmMessage)) {
        return;
      }

      const payload = buildSiteUpsertPayloadFromSite(selectedSite, { isArchived: nextArchivedState });
      await submitMasterData(
        "/api/v1/master-data/sites",
        payload,
        nextArchivedState ? "Standort archiviert." : "Standort reaktiviert.",
        {
          refreshOpenAlarms: true,
          refreshSiteMarkers: true,
          afterSuccess(overview) {
            const refreshedSite = overview.sites.find((site) => site.id === selectedSite.id);
            if (refreshedSite) {
              state.selectedSiteId = refreshedSite.id;
              state.selectedMapSiteId = refreshedSite.id;
              state.siteManagementView = "detail";
            }
          }
        }
      );
    },
    async handleDeviceSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      const deviceId = normalizeOptionalField(formData.get("id"));
      const vendor = normalizeOptionalField(formData.get("vendor"));
      const model = normalizeOptionalField(formData.get("model"));
      const serialNumber = normalizeOptionalField(formData.get("serialNumber"));
      const networkAddress = normalizeOptionalField(formData.get("networkAddress"));
      const macAddress = normalizeOptionalField(formData.get("macAddress"));
      const externalDeviceId = normalizeOptionalField(formData.get("externalDeviceId"));
      const linkedNvrDeviceId = normalizeOptionalField(formData.get("linkedNvrDeviceId"));
      const channelNumber = normalizeOptionalField(formData.get("channelNumber"));
      const zone = normalizeOptionalField(formData.get("zone"));
      const viewingDirection = normalizeOptionalField(formData.get("viewingDirection"));
      const mountLocation = normalizeOptionalField(formData.get("mountLocation"));
      const analyticsName = normalizeOptionalField(formData.get("analyticsName"));
      const ruleName = normalizeOptionalField(formData.get("ruleName"));
      const storageLabel = normalizeOptionalField(formData.get("storageLabel"));
      const wanIp = normalizeOptionalField(formData.get("wanIp"));
      const lanIp = normalizeOptionalField(formData.get("lanIp"));
      const vpnType = normalizeOptionalField(formData.get("vpnType"));
      const provider = normalizeOptionalField(formData.get("provider"));
      const simIdentifier = normalizeOptionalField(formData.get("simIdentifier"));
      const audioZone = normalizeOptionalField(formData.get("audioZone"));
      const supportsPaging = normalizeOptionalField(formData.get("supportsPaging"));
      const payload: DeviceUpsertInput = {
        ...(deviceId ? { id: deviceId } : {}),
        siteId: String(formData.get("siteId") ?? ""),
        name: String(formData.get("name") ?? ""),
        type: readSelectValue(formData, "type", deviceTypeOptions),
        ...(vendor ? { vendor } : {}),
        ...(model ? { model } : {}),
        ...(serialNumber ? { serialNumber } : {}),
        status: readSelectValue(formData, "status", ["planned", "installed", "retired"] as const),
        isActive: String(formData.get("isActive") ?? "true") === "true",
        ...(networkAddress ? { networkAddress } : {}),
        ...(macAddress ? { macAddress } : {}),
        ...(externalDeviceId ? { externalDeviceId } : {}),
        ...(linkedNvrDeviceId ? { linkedNvrDeviceId } : {}),
        ...(channelNumber ? { channelNumber: Number(channelNumber) } : {}),
        ...(zone ? { zone } : {}),
        ...(viewingDirection ? { viewingDirection } : {}),
        ...(mountLocation ? { mountLocation } : {}),
        ...(analyticsName ? { analyticsName } : {}),
        ...(ruleName ? { ruleName } : {}),
        ...(storageLabel ? { storageLabel } : {}),
        ...(wanIp ? { wanIp } : {}),
        ...(lanIp ? { lanIp } : {}),
        ...(vpnType ? { vpnType } : {}),
        ...(provider ? { provider } : {}),
        ...(simIdentifier ? { simIdentifier } : {}),
        ...(audioZone ? { audioZone } : {}),
        ...(supportsPaging ? { supportsPaging: supportsPaging === "true" } : {})
      };
      await submitMasterData("/api/v1/master-data/devices", payload, "Geraet gespeichert.", {
        refreshOpenAlarms: true,
        resetForm: form,
        afterSuccess() {
          delete state.selectedDeviceEditorId;
          state.siteManagementDeviceModalOpen = false;
          state.selectedSiteId = payload.siteId;
          state.siteManagementView = "detail";
          state.selectedSiteManagementSection = getSectionForDeviceType(payload.type);
          state.siteManagementDeviceDraftType = payload.type;
        }
      });
    },
    async handleSiteManagementDeleteDevice(): Promise<void> {
      if (!state.selectedDeviceEditorId) {
        deps.setFailure("Keine Komponente zum Loeschen ausgewaehlt.");
        return;
      }
      if (!window.confirm("Komponente wirklich loeschen?")) {
        return;
      }

      deps.setBusyState("master-data-delete", "Komponente wird geloescht");
      try {
        await deps.runRenderBatch(async () => {
          const response = await apiRequest<{ overview: MasterDataOverview }>(`/api/v1/master-data/devices/${state.selectedDeviceEditorId}`, {
            method: "DELETE"
          });
          state.overview = response.overview;
          normalizeSelectedSitePlans(response.overview);
          normalizeSelectedSiteManagement(response.overview);
          state.siteManagementDeviceModalOpen = false;
          delete state.selectedDeviceEditorId;
          deps.setSuccess("Komponente geloescht.");
          await deps.fetchOpenAlarms(null);
          await deps.fetchSiteMarkers(null);
        });
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Komponente konnte nicht geloescht werden.");
      } finally {
        deps.setBusyState("master-data-delete", null);
      }
    },
    async handleAlarmSourceMappingSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      const mappingId = normalizeOptionalField(formData.get("id"));
      const nvrComponentId = normalizeOptionalField(formData.get("nvrComponentId"));
      const externalSourceKey = normalizeOptionalField(formData.get("externalSourceKey"));
      const externalDeviceId = normalizeOptionalField(formData.get("externalDeviceId"));
      const externalRecorderId = normalizeOptionalField(formData.get("externalRecorderId"));
      const channelNumber = normalizeOptionalField(formData.get("channelNumber"));
      const serialNumber = normalizeOptionalField(formData.get("serialNumber"));
      const analyticsName = normalizeOptionalField(formData.get("analyticsName"));
      const eventNamespace = normalizeOptionalField(formData.get("eventNamespace"));
      const mediaBundleProfileKey = normalizeOptionalField(formData.get("mediaBundleProfileKey"));
      const description = normalizeOptionalField(formData.get("description"));
      const normalizedMediaBundleProfileKey = mediaBundleProfileKey as NonNullable<AlarmSourceMappingUpsertInput["mediaBundleProfileKey"]> | null;
      const payload: AlarmSourceMappingUpsertInput = {
        ...(mappingId ? { id: mappingId } : {}),
        siteId: String(formData.get("siteId") ?? ""),
        componentId: String(formData.get("componentId") ?? ""),
        ...(nvrComponentId ? { nvrComponentId } : {}),
        vendor: String(formData.get("vendor") ?? ""),
        sourceType: String(formData.get("sourceType") ?? ""),
        ...(externalSourceKey ? { externalSourceKey } : {}),
        ...(externalDeviceId ? { externalDeviceId } : {}),
        ...(externalRecorderId ? { externalRecorderId } : {}),
        ...(channelNumber ? { channelNumber: Number(channelNumber) } : {}),
        ...(serialNumber ? { serialNumber } : {}),
        ...(analyticsName ? { analyticsName } : {}),
        ...(eventNamespace ? { eventNamespace } : {}),
        ...(normalizedMediaBundleProfileKey ? { mediaBundleProfileKey: normalizedMediaBundleProfileKey } : {}),
        ...(description ? { description } : {}),
        sortOrder: Number(formData.get("sortOrder") ?? 100),
        isActive: String(formData.get("isActive") ?? "true") === "true"
      };
      await submitMasterData("/api/v1/master-data/alarm-source-mappings", payload, "Alarmquellen-Mapping gespeichert.", {
        refreshOpenAlarms: true,
        resetForm: form,
        afterSuccess() {
          delete state.selectedAlarmSourceMappingEditorId;
          state.selectedSiteId = payload.siteId;
          state.siteManagementView = "detail";
          state.selectedSiteManagementSection = "alarm-sources";
        }
      });
    },
    async handleSiteManagementToggleAlarmSourceMapping(mappingId: string): Promise<void> {
      if (!state.overview || !mappingId) {
        deps.setFailure("Kein Alarmquellen-Mapping ausgewaehlt.");
        return;
      }
      const selectedSite = state.overview.sites.find((site) => site.alarmSourceMappings.some((mapping) => mapping.id === mappingId));
      const selectedMapping = selectedSite?.alarmSourceMappings.find((mapping) => mapping.id === mappingId);
      if (!selectedSite || !selectedMapping) {
        deps.setFailure("Alarmquellen-Mapping konnte nicht gefunden werden.");
        return;
      }

      const payload: AlarmSourceMappingUpsertInput = {
        id: selectedMapping.id,
        siteId: selectedMapping.siteId,
        componentId: selectedMapping.componentId,
        ...(selectedMapping.nvrComponentId ? { nvrComponentId: selectedMapping.nvrComponentId } : {}),
        vendor: selectedMapping.vendor,
        sourceType: selectedMapping.sourceType,
        ...(selectedMapping.externalSourceKey ? { externalSourceKey: selectedMapping.externalSourceKey } : {}),
        ...(selectedMapping.externalDeviceId ? { externalDeviceId: selectedMapping.externalDeviceId } : {}),
        ...(selectedMapping.externalRecorderId ? { externalRecorderId: selectedMapping.externalRecorderId } : {}),
        ...(selectedMapping.channelNumber !== undefined ? { channelNumber: selectedMapping.channelNumber } : {}),
        ...(selectedMapping.serialNumber ? { serialNumber: selectedMapping.serialNumber } : {}),
        ...(selectedMapping.analyticsName ? { analyticsName: selectedMapping.analyticsName } : {}),
        ...(selectedMapping.eventNamespace ? { eventNamespace: selectedMapping.eventNamespace } : {}),
        ...(selectedMapping.mediaBundleProfileKey ? { mediaBundleProfileKey: selectedMapping.mediaBundleProfileKey } : {}),
        ...(selectedMapping.description ? { description: selectedMapping.description } : {}),
        sortOrder: selectedMapping.sortOrder,
        isActive: !selectedMapping.isActive
      };
      await submitMasterData(
        "/api/v1/master-data/alarm-source-mappings",
        payload,
        payload.isActive ? "Alarmquellen-Mapping aktiviert." : "Alarmquellen-Mapping deaktiviert.",
        {
          refreshOpenAlarms: true,
          afterSuccess() {
            state.selectedSiteId = selectedSite.id;
            state.siteManagementView = "detail";
            state.selectedSiteManagementSection = "alarm-sources";
          }
        }
      );
    },
    async handlePlanSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      await submitMasterData("/api/v1/master-data/plans", {
        siteId: String(formData.get("siteId") ?? ""),
        name: String(formData.get("name") ?? ""),
        kind: readSelectValue(formData, "kind", planKindOptions),
        assetName: String(formData.get("assetName") ?? ""),
        markerLabel: String(formData.get("markerLabel") ?? ""),
        markerType: readSelectValue(formData, "markerType", ["camera", "entry", "speaker", "custom"] as const),
        markerX: Number(formData.get("markerX") ?? 50),
        markerY: Number(formData.get("markerY") ?? 50),
        deviceId: normalizeOptionalField(formData.get("deviceId"))
      }, "Plan gespeichert.", { resetForm: form });
    },
    async handleWorkflowProfileSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      deps.setBusyState("workflow-profile-save", "Einsatzanweisung wird gespeichert");
      try {
        await apiRequest("/api/v1/alarm-workflow-profiles", {
          method: "POST",
          body: JSON.stringify({
            siteId: String(formData.get("siteId") ?? ""),
            code: String(formData.get("code") ?? ""),
            label: String(formData.get("label") ?? ""),
            description: normalizeOptionalField(formData.get("description")),
            timeContext: readSelectValue(formData, "timeContext", ["normal", "weekend", "special"] as const),
            specialContextLabel: normalizeOptionalField(formData.get("specialContextLabel")),
            activeFromTime: normalizeOptionalField(formData.get("activeFromTime")),
            activeToTime: normalizeOptionalField(formData.get("activeToTime")),
            isActive: true,
            sortOrder: Number(formData.get("sortOrder") ?? 40),
            steps: [
              {
                stepCode: "required_contact",
                title: String(formData.get("requiredStepTitle") ?? ""),
                instruction: String(formData.get("requiredStepInstruction") ?? ""),
                sortOrder: 10,
                isRequiredByDefault: true,
                actionTypeId: "action-call-customer"
              },
              {
                stepCode: "optional_escalation",
                title: String(formData.get("optionalStepTitle") ?? ""),
                instruction: "Optionale Eskalation je nach Lagebild.",
                sortOrder: 20,
                isRequiredByDefault: false,
                actionTypeId: "action-call-security"
              }
            ]
          })
        });
        form.reset();
        await deps.fetchWorkflowProfiles("Einsatzanweisung gespeichert.");
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Einsatzanweisung konnte nicht gespeichert werden.");
      } finally {
        deps.setBusyState("workflow-profile-save", null);
      }
    }
  };
}
