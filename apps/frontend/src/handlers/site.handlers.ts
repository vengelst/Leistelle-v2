import type { AppHandlers } from "../actions/events.js";
import type { WorkspaceRouter } from "../navigation/router.js";
import type { DeviceType } from "@leitstelle/contracts";

import { state } from "../state.js";
import { scrollToRegion } from "../utils.js";

type SiteHandlerDeps = {
  fetchOverview: (successMessage: string | null) => Promise<void>;
  fetchSiteMarkers: (successMessage: string | null) => Promise<void>;
  handleMapFocusSite: (siteId: string, scope: "both" | "alarms" | "monitoring") => Promise<void>;
  handleMapMarkerSelect: (siteId: string) => Promise<void>;
  handleDetail: (alarmCaseId: string) => Promise<void>;
  handleMonitoringDetail: (disturbanceId: string) => Promise<void>;
  handleSitePlanSelect: (siteId: string, planId: string) => void;
  handleSitePlanMarkerSelect: (siteId: string, planId: string, markerId: string) => void;
  handleSitePlanZoom: (planId: string, direction: -1 | 1) => void;
  handleCustomerSubmit: (event: SubmitEvent) => Promise<void>;
  handleSiteSubmit: (event: SubmitEvent) => Promise<void>;
  handleSiteManagementToggleArchive: (siteId: string) => Promise<void>;
  handleSiteManagementShowArchivedToggle: (showArchived: boolean) => void;
  handleDeviceSubmit: (event: SubmitEvent) => Promise<void>;
  handleSiteManagementDeleteDevice: () => Promise<void>;
  handleAlarmSourceMappingSubmit: (event: SubmitEvent) => Promise<void>;
  handleSiteManagementToggleAlarmSourceMapping: (mappingId: string) => Promise<void>;
  handlePlanSubmit: (event: SubmitEvent) => Promise<void>;
  router: WorkspaceRouter;
  render: () => void;
};

export function createSiteHandlers(
  deps: SiteHandlerDeps
): Pick<
  AppHandlers,
  | "fetchOverview"
  | "fetchSiteMarkers"
  | "handleMapFocusSite"
  | "handleMapMarkerSelect"
  | "handleMapOpenSiteDetails"
  | "handleSiteManagementSelectSite"
  | "handleSiteManagementBackToList"
  | "handleSiteManagementSectionChange"
  | "handleSiteManagementSearchInput"
  | "handleSiteManagementStatusFilterChange"
  | "handleSiteManagementShowArchivedToggle"
  | "handleSiteManagementCreateSite"
  | "handleSiteManagementCancelSiteEdit"
  | "handleSiteManagementEditSite"
  | "handleSiteManagementToggleArchive"
  | "handleSiteManagementCreateDevice"
  | "handleSiteManagementEditDevice"
  | "handleSiteManagementDeviceTypeChange"
  | "handleSiteManagementCloseDeviceModal"
  | "handleSiteManagementDeleteDevice"
  | "handleSiteManagementEditAlarmSourceMapping"
  | "handleSiteManagementCancelAlarmSourceMappingEdit"
  | "handleSiteManagementToggleAlarmSourceMapping"
  | "handleMapOpenAlarm"
  | "handleMapOpenDisturbance"
  | "handleSitePlanSelect"
  | "handleSitePlanMarkerSelect"
  | "handleSitePlanZoom"
  | "handleSitePlanOpenSiteDetails"
  | "handleSitePlanOpenAlarm"
  | "handleSitePlanOpenDisturbance"
  | "handleCustomerSubmit"
  | "handleSiteSubmit"
  | "handleDeviceSubmit"
  | "handleAlarmSourceMappingSubmit"
  | "handlePlanSubmit"
> {
  function applySiteSelection(siteId: string): void {
    if (!siteId) return;
    state.selectedSiteId = siteId;
    state.selectedMapSiteId = siteId;
  }

  function navigateToSiteManagement(): void {
    deps.router.navigateWorkspace("sites");
  }

  function scrollToSiteManagement(): void {
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(state.activeWorkspace === "settings"
          ? "#region-settings"
          : "#region-master-data")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return {
    fetchOverview: deps.fetchOverview,
    fetchSiteMarkers: deps.fetchSiteMarkers,
    handleMapFocusSite: deps.handleMapFocusSite,
    handleMapMarkerSelect: deps.handleMapMarkerSelect,
    handleMapOpenSiteDetails(siteId: string): void {
      if (!siteId) return;
      applySiteSelection(siteId);
      state.siteManagementView = "detail";
      state.siteManagementCreateSiteMode = false;
      state.message = "Standortdetails im Stammdatenbereich fokussiert.";
      state.error = null;
      navigateToSiteManagement();
      deps.render();
      scrollToSiteManagement();
    },
    handleSiteManagementSelectSite(siteId: string): void {
      if (!siteId) return;
      applySiteSelection(siteId);
      state.siteManagementView = "detail";
      state.siteManagementCreateSiteMode = false;
      delete state.selectedSiteEditorId;
      state.siteManagementDeviceModalOpen = false;
      delete state.selectedDeviceEditorId;
      delete state.selectedAlarmSourceMappingEditorId;
      deps.render();
    },
    handleSiteManagementBackToList(): void {
      state.siteManagementView = "list";
      state.siteManagementCreateSiteMode = false;
      delete state.selectedSiteEditorId;
      state.siteManagementDeviceModalOpen = false;
      delete state.selectedDeviceEditorId;
      delete state.selectedAlarmSourceMappingEditorId;
      deps.render();
    },
    handleSiteManagementSectionChange(section: string): void {
      if (
        section !== "overview"
        && section !== "master-data"
        && section !== "technology"
        && section !== "network"
        && section !== "audio"
        && section !== "alarm-sources"
        && section !== "history"
      ) {
        return;
      }
      state.selectedSiteManagementSection = section;
      if (section !== "alarm-sources") {
        delete state.selectedAlarmSourceMappingEditorId;
      }
      deps.render();
    },
    handleSiteManagementSearchInput(value: string): void {
      state.siteManagementSearch = value;
      deps.render();
    },
    handleSiteManagementStatusFilterChange(value: string): void {
      state.siteManagementStatusFilter = value === "all" || value === "planned" || value === "active" || value === "limited" || value === "offline"
        ? value
        : "all";
      deps.render();
    },
    handleSiteManagementShowArchivedToggle(showArchived: boolean): void {
      state.siteManagementShowArchived = showArchived;
      deps.render();
    },
    handleSiteManagementCreateSite(): void {
      state.siteManagementView = "list";
      state.siteManagementCreateSiteMode = true;
      state.selectedSiteManagementSection = "overview";
      delete state.selectedSiteEditorId;
      state.siteManagementDeviceModalOpen = false;
      delete state.selectedDeviceEditorId;
      delete state.selectedAlarmSourceMappingEditorId;
      deps.render();
      scrollToSiteManagement();
    },
    handleSiteManagementCancelSiteEdit(): void {
      state.siteManagementCreateSiteMode = false;
      delete state.selectedSiteEditorId;
      deps.render();
    },
    handleSiteManagementEditSite(siteId: string): void {
      if (!siteId) return;
      applySiteSelection(siteId);
      state.siteManagementView = "detail";
      state.siteManagementCreateSiteMode = false;
      state.selectedSiteEditorId = siteId;
      state.selectedSiteManagementSection = "master-data";
      delete state.selectedAlarmSourceMappingEditorId;
      deps.render();
      scrollToSiteManagement();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.querySelector<HTMLInputElement>("#site-form input[name=\"siteName\"]")?.focus();
        });
      });
    },
    handleSiteManagementToggleArchive: deps.handleSiteManagementToggleArchive,
    handleSiteManagementCreateDevice(deviceType?: string): void {
      state.siteManagementDeviceModalOpen = true;
      delete state.selectedDeviceEditorId;
      if (
        deviceType === "router"
        || deviceType === "nvr"
        || deviceType === "camera"
        || deviceType === "dome_ptz_camera"
        || deviceType === "bi_spectral_camera"
        || deviceType === "speaker"
        || deviceType === "sensor"
        || deviceType === "io_module"
      ) {
        state.siteManagementDeviceDraftType = deviceType as DeviceType;
      }
      if (state.siteManagementDeviceDraftType === "router") {
        state.selectedSiteManagementSection = "network";
      } else if (state.siteManagementDeviceDraftType === "speaker") {
        state.selectedSiteManagementSection = "audio";
      } else {
        state.selectedSiteManagementSection = "technology";
      }
      deps.render();
    },
    handleSiteManagementEditDevice(deviceId: string): void {
      if (!deviceId || !state.overview) return;
      for (const site of state.overview.sites) {
        const selectedDevice = site.devices.find((device) => device.id === deviceId);
        if (!selectedDevice) {
          continue;
        }
        applySiteSelection(site.id);
        state.selectedDeviceEditorId = deviceId;
        state.siteManagementView = "detail";
        state.siteManagementCreateSiteMode = false;
        state.siteManagementDeviceModalOpen = true;
        state.siteManagementDeviceDraftType = selectedDevice.type;
        delete state.selectedAlarmSourceMappingEditorId;
        state.selectedSiteManagementSection = selectedDevice.type === "router"
          ? "network"
          : selectedDevice.type === "speaker"
            ? "audio"
            : "technology";
        deps.render();
        return;
      }
    },
    handleSiteManagementDeviceTypeChange(deviceType: string): void {
      if (
        deviceType !== "router"
        && deviceType !== "nvr"
        && deviceType !== "camera"
        && deviceType !== "dome_ptz_camera"
        && deviceType !== "bi_spectral_camera"
        && deviceType !== "speaker"
        && deviceType !== "sensor"
        && deviceType !== "io_module"
      ) {
        return;
      }
      state.siteManagementDeviceDraftType = deviceType;
      deps.render();
    },
    handleSiteManagementCloseDeviceModal(): void {
      state.siteManagementDeviceModalOpen = false;
      delete state.selectedDeviceEditorId;
      deps.render();
    },
    handleSiteManagementDeleteDevice: deps.handleSiteManagementDeleteDevice,
    handleSiteManagementEditAlarmSourceMapping(mappingId: string): void {
      if (!mappingId || !state.overview) return;
      for (const site of state.overview.sites) {
        const selectedMapping = site.alarmSourceMappings.find((mapping) => mapping.id === mappingId);
        if (!selectedMapping) {
          continue;
        }
        applySiteSelection(site.id);
        state.siteManagementView = "detail";
        state.siteManagementCreateSiteMode = false;
        state.selectedSiteManagementSection = "alarm-sources";
        state.siteManagementDeviceModalOpen = false;
        delete state.selectedDeviceEditorId;
        state.selectedAlarmSourceMappingEditorId = mappingId;
        deps.render();
        return;
      }
    },
    handleSiteManagementCancelAlarmSourceMappingEdit(): void {
      delete state.selectedAlarmSourceMappingEditorId;
      deps.render();
    },
    handleSiteManagementToggleAlarmSourceMapping: deps.handleSiteManagementToggleAlarmSourceMapping,
    async handleMapOpenAlarm(alarmCaseId: string): Promise<void> {
      if (!alarmCaseId) return;
      deps.router.navigateTo({ workspace: "leitstelle", leitstelleMode: state.leitstelleMode });
      await deps.handleDetail(alarmCaseId);
      scrollToRegion("pipeline");
    },
    async handleMapOpenDisturbance(disturbanceId: string): Promise<void> {
      if (!disturbanceId) return;
      deps.router.navigateTo({ workspace: "leitstelle", leitstelleMode: state.leitstelleMode });
      await deps.handleMonitoringDetail(disturbanceId);
      scrollToRegion("monitoring");
    },
    handleSitePlanSelect: deps.handleSitePlanSelect,
    handleSitePlanMarkerSelect: deps.handleSitePlanMarkerSelect,
    handleSitePlanZoom: deps.handleSitePlanZoom,
    handleSitePlanOpenSiteDetails(siteId: string): void {
      if (!siteId) return;
      applySiteSelection(siteId);
      state.siteManagementView = "detail";
      state.siteManagementCreateSiteMode = false;
      state.message = "Standortkontext mit Objektplan geoeffnet.";
      state.error = null;
      navigateToSiteManagement();
      deps.render();
      scrollToSiteManagement();
    },
    async handleSitePlanOpenAlarm(alarmCaseId: string): Promise<void> {
      if (!alarmCaseId) return;
      deps.router.navigateTo({ workspace: "leitstelle", leitstelleMode: state.leitstelleMode });
      await deps.handleDetail(alarmCaseId);
      scrollToRegion("pipeline");
    },
    async handleSitePlanOpenDisturbance(disturbanceId: string): Promise<void> {
      if (!disturbanceId) return;
      deps.router.navigateTo({ workspace: "leitstelle", leitstelleMode: state.leitstelleMode });
      await deps.handleMonitoringDetail(disturbanceId);
      scrollToRegion("monitoring");
    },
    handleCustomerSubmit: deps.handleCustomerSubmit,
    handleSiteSubmit: deps.handleSiteSubmit,
    handleDeviceSubmit: deps.handleDeviceSubmit,
    handleAlarmSourceMappingSubmit: deps.handleAlarmSourceMappingSubmit,
    handlePlanSubmit: deps.handlePlanSubmit
  };
}
