import type { AppHandlers } from "./actions/events.js";

import { createMapHandlers } from "./actions/map-handlers.js";
import { createMasterDataHandlers } from "./actions/master-data-handlers.js";
import { createReportingArchiveHandlers } from "./actions/reporting-archive-handlers.js";
import { createShiftPlanningHandlers } from "./actions/shift-planning-handlers.js";
import { applyPendingOperatorFocus, bindAppEvents } from "./actions/events.js";
import { createAdminHandlers } from "./handlers/admin.handlers.js";
import { createAlarmDomainHandlers } from "./handlers/alarm.handlers.js";
import { createArchiveHandlers } from "./handlers/archive.handlers.js";
import { createDisturbanceHandlers } from "./handlers/disturbance.handlers.js";
import { createSessionHandlers } from "./handlers/session.handlers.js";
import { createSettingsHandlers } from "./handlers/settings.handlers.js";
import { createSiteHandlers } from "./handlers/site.handlers.js";
import { createShiftHandlers } from "./handlers/shift.handlers.js";
import { createUiHandlers } from "./handlers/ui.handlers.js";
import { createAlarmLiveRefreshController } from "./alarm-live-refresh.js";
import { createAlarmSoundController } from "./alarm-sound.js";
import { createWorkspaceRouter } from "./navigation/router.js";
import { normalizeOperatorLayout, normalizeOperatorLayoutProfiles } from "./operator-layout.js";
import {
  applyOperatorWindowDocumentState,
  createOperatorSelectionSync,
  openSecondaryOperatorWindow,
  resolveOperatorWindowRole
} from "./operator-window.js";
import { state } from "./state.js";
import { captureDomState, restoreDomState } from "./ui/dom-preservation.js";
import { scrollToRegion } from "./utils.js";
import { renderApp } from "./views/app.js";

const themeStorageKey = "leitstelle.theme.mode";
const kioskStorageKey = "leitstelle.ui.kiosk";
const shellMenuPositionStorageKey = "leitstelle.ui.shell-menu-position";
const alarmSoundEnabledStorageKey = "leitstelle.alarm.sound.enabled";
const alarmSoundIncludeNormalPriorityStorageKey = "leitstelle.alarm.sound.include-normal";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Frontend root element #app is missing.");

const root = app;
let renderScheduled = false;
let renderBatchDepth = 0;
let renderQueuedWhileBatch = false;

state.operatorWindowRole = resolveOperatorWindowRole(window.location.search);
applyOperatorWindowDocumentState(state.operatorWindowRole);
initializeThemeMode();
initializeKioskMode();
initializeShellMenuPosition();
initializeAlarmSoundPreferences();

const router = createWorkspaceRouter({
  onNavigationChange: render
});

router.initializeFromHash();

const runtime = {
  render,
  setBusyState,
  setSuccess,
  setFailure,
  runRenderBatch
};

const alarmSoundController = createAlarmSoundController({
  onStateChange: render
});

const uiHandlers = createUiHandlers({
  ...runtime,
  alarmSoundEnabledStorageKey,
  alarmSoundIncludeNormalPriorityStorageKey,
  applyThemeMode,
  armAlarmSound: () => alarmSoundController.arm(),
  broadcastOperatorLayoutUpdate: () => operatorSelectionSync.broadcastLayoutUpdate(
    state.operatorLayout,
    state.operatorLayoutProfiles,
    state.operatorLayoutDraftName,
    state.operatorLayoutEditorOpen
  ),
  kioskStorageKey,
  shellMenuPositionStorageKey,
  openSecondaryOperatorWindow: () => openSecondaryOperatorWindow(router.hrefForLeitstelleMode("operator")),
  playAlarmSoundPreview: () => alarmSoundController.playPreview(),
  router,
  themeStorageKey
});

const reportingArchiveActions = createReportingArchiveHandlers(runtime);
const shiftPlanningActions = createShiftPlanningHandlers(runtime);
let broadcastSelectedAlarmToOperatorWindows = (_alarmCaseId: string): void => undefined;
const alarmHandlers = createAlarmDomainHandlers({
  ...runtime,
  handleOpenAlarmPipelineUpdate: (update) => alarmSoundController.handleAlarmPipelineUpdate(update),
  broadcastAlarmSelection: (alarmCaseId) => broadcastSelectedAlarmToOperatorWindows(alarmCaseId)
});
const disturbanceHandlers = createDisturbanceHandlers(runtime);
const mapActions = createMapHandlers({
  ...runtime,
  fetchOpenAlarms: alarmHandlers.fetchOpenAlarms,
  fetchOpenDisturbances: disturbanceHandlers.fetchOpenDisturbances
});
const masterDataActions = createMasterDataHandlers({
  ...runtime,
  fetchOpenAlarms: alarmHandlers.fetchOpenAlarms,
  fetchSiteMarkers: mapActions.fetchSiteMarkers,
  fetchWorkflowProfiles: alarmHandlers.fetchWorkflowProfiles
});
const archiveHandlers = createArchiveHandlers({
  fetchReporting: reportingArchiveActions.fetchReporting,
  fetchArchiveCases: reportingArchiveActions.fetchArchiveCases,
  handleReportingFilterSubmit: reportingArchiveActions.handleReportingFilterSubmit,
  handleReportingReset: reportingArchiveActions.handleReportingReset,
  handleReportingExport: reportingArchiveActions.handleReportingExport,
  handleArchiveFilterSubmit: reportingArchiveActions.handleArchiveFilterSubmit,
  handleArchiveReset: reportingArchiveActions.handleArchiveReset,
  handleArchiveExport: reportingArchiveActions.handleArchiveExport,
  handleDetail: alarmHandlers.handleDetail,
  router
});
const settingsHandlers = createSettingsHandlers({
  fetchWorkflowProfiles: alarmHandlers.fetchWorkflowProfiles,
  handleGlobalSettingsSubmit: masterDataActions.handleGlobalSettingsSubmit,
  handleWorkflowProfileSubmit: masterDataActions.handleWorkflowProfileSubmit,
  render
});
const shiftHandlers = createShiftHandlers({
  fetchShiftPlanning: shiftPlanningActions.fetchShiftPlanning,
  pollShiftPlanning: shiftPlanningActions.pollShiftPlanning,
  handleShiftPlanningFilterSubmit: shiftPlanningActions.handleShiftPlanningFilterSubmit,
  handleShiftPlanningReset: shiftPlanningActions.handleShiftPlanningReset,
  handleShiftPlanningSubmit: shiftPlanningActions.handleShiftPlanningSubmit,
  handleShiftPlanningEdit: shiftPlanningActions.handleShiftPlanningEdit,
  handleShiftPlanningEditorReset: shiftPlanningActions.handleShiftPlanningEditorReset
});
const siteHandlers = createSiteHandlers({
  fetchOverview: masterDataActions.fetchOverview,
  fetchSiteMarkers: mapActions.fetchSiteMarkers,
  handleMapFocusSite: mapActions.handleMapFocusSite,
  handleMapMarkerSelect: mapActions.handleMapMarkerSelect,
  handleDetail: alarmHandlers.handleDetail,
  handleMonitoringDetail: disturbanceHandlers.handleMonitoringDetail,
  handleSitePlanSelect: mapActions.handleSitePlanSelect,
  handleSitePlanMarkerSelect: mapActions.handleSitePlanMarkerSelect,
  handleSitePlanZoom: mapActions.handleSitePlanZoom,
  handleCustomerSubmit: masterDataActions.handleCustomerSubmit,
  handleSiteSubmit: masterDataActions.handleSiteSubmit,
  handleSiteManagementToggleArchive: masterDataActions.handleSiteManagementToggleArchive,
  handleSiteManagementShowArchivedToggle: (showArchived: boolean) => {
    state.siteManagementShowArchived = showArchived;
    render();
  },
  handleDeviceSubmit: masterDataActions.handleDeviceSubmit,
  handleSiteManagementDeleteDevice: masterDataActions.handleSiteManagementDeleteDevice,
  handleAlarmSourceMappingSubmit: masterDataActions.handleAlarmSourceMappingSubmit,
  handleSiteManagementToggleAlarmSourceMapping: masterDataActions.handleSiteManagementToggleAlarmSourceMapping,
  handlePlanSubmit: masterDataActions.handlePlanSubmit,
  router,
  render
});
const sessionHandlers = createSessionHandlers({
  ...runtime,
  refreshWorkspace,
  resetAlarmSoundTracking: () => alarmSoundController.resetTracking(),
  router
});
const adminHandlers = createAdminHandlers(runtime);
const operatorSelectionSync = createOperatorSelectionSync({
  onAlarmSelection: (alarmCaseId) => {
    if (!alarmCaseId || state.operatorWindowRole !== "primary") {
      return;
    }

    const shouldNavigate = state.activeWorkspace !== "leitstelle" || state.leitstelleMode !== "operator";
    if (shouldNavigate) {
      router.navigateLeitstelleMode("operator");
      render();
    }

    if (state.selectedAlarmDetail?.alarmCase.id === alarmCaseId && !shouldNavigate) {
      return;
    }

    void alarmHandlers.handleDetail(alarmCaseId);
  },
  onLayoutUpdate: (layout, profiles, draftName, editorOpen) => {
    state.operatorLayout = normalizeOperatorLayout(layout);
    state.operatorLayoutProfiles = normalizeOperatorLayoutProfiles(profiles);
    state.operatorLayoutDraftName = draftName;
    state.operatorLayoutEditorOpen = editorOpen;
    render();
  }
});
broadcastSelectedAlarmToOperatorWindows = (alarmCaseId) => {
  if (state.operatorWindowRole === "secondary") {
    operatorSelectionSync.broadcastAlarmSelection(alarmCaseId);
  }
};

const handlers: AppHandlers = {
  ...uiHandlers,
  ...sessionHandlers,
  ...adminHandlers,
  ...archiveHandlers,
  ...shiftHandlers,
  ...alarmHandlers,
  ...disturbanceHandlers,
  ...siteHandlers,
  ...settingsHandlers,
  scrollToRegion
};

router.start();
operatorSelectionSync.start();
createAlarmLiveRefreshController({
  intervalMs: 15000,
  setInterval: (callback, intervalMs) => window.setInterval(callback, intervalMs),
  clearInterval: (intervalId) => window.clearInterval(intervalId),
  onVisibilityChange: (callback) => {
    const listener = () => {
      callback();
    };
    window.document.addEventListener("visibilitychange", listener);
    return () => {
      window.document.removeEventListener("visibilitychange", listener);
    };
  },
  isDocumentVisible: () => window.document.visibilityState === "visible",
  shouldRefresh: () => getLeitstelleRefreshScope() !== null,
  shouldSkip: () => {
    const scope = getLeitstelleRefreshScope();
    if (scope === "alarms") {
      return Object.keys(state.pendingOperations).some((key) =>
        key === "workspace-refresh" || key === "open-alarms" || key.startsWith("alarm-")
      );
    }
    if (scope === "disturbances") {
      return Object.keys(state.pendingOperations).some((key) =>
        key === "workspace-refresh" || key === "open-disturbances" || key.startsWith("monitoring-")
      );
    }
    if (scope === "wallboard") {
      return Object.keys(state.pendingOperations).some((key) =>
        key === "workspace-refresh"
        || key === "open-alarms"
        || key === "open-disturbances"
        || key === "dashboard"
        || key === "shift-planning"
        || key.startsWith("alarm-")
        || key.startsWith("monitoring-")
      );
    }
    return false;
  },
  refreshOpenAlarms: async () => {
    const scope = getLeitstelleRefreshScope();
    if (scope === "wallboard") {
      return await refreshWallboard();
    }
    if (scope === "disturbances") {
      return await disturbanceHandlers.pollOpenDisturbances();
    }
    if (scope === "alarms") {
      return await alarmHandlers.pollOpenAlarms();
    }
    return { changed: false, selectedChanged: false };
  },
  refreshSelectedDetail: async () => {
    const scope = getLeitstelleRefreshScope();
    if (scope === "wallboard") {
      return false;
    }
    if (scope === "disturbances") {
      return await disturbanceHandlers.pollSelectedMonitoringDetail();
    }
    if (scope === "alarms") {
      return await alarmHandlers.pollSelectedDetail();
    }
    return false;
  },
  render,
  setFailure,
  failureMessage: "Automatische Aktualisierung der Leitstellen-Pipeline fehlgeschlagen."
}).start();

render(true);
void sessionHandlers.hydrateSession();

function getLeitstelleRefreshScope(): "alarms" | "disturbances" | "wallboard" | null {
  if (!state.session || state.activeWorkspace !== "leitstelle") {
    return null;
  }

  if (state.leitstelleMode === "disturbances") {
    return "disturbances";
  }

  if (state.leitstelleMode === "overview" || state.leitstelleMode === "alarms" || state.leitstelleMode === "operator") {
    return "alarms";
  }

  if (state.leitstelleMode === "wallboard") {
    return "wallboard";
  }

  return null;
}

async function refreshWallboard(): Promise<{ changed: boolean; selectedChanged: boolean }> {
  const [alarmResult, disturbanceResult, dashboardChanged, shiftPlanningChanged] = await Promise.all([
    alarmHandlers.pollOpenAlarms(),
    disturbanceHandlers.pollOpenDisturbances(),
    uiHandlers.pollDashboard(),
    shiftHandlers.pollShiftPlanning()
  ]);

  return {
    changed: alarmResult.changed || disturbanceResult.changed || dashboardChanged || shiftPlanningChanged,
    selectedChanged: alarmResult.selectedChanged || disturbanceResult.selectedChanged
  };
}

function initializeThemeMode(): void {
  const storedTheme = window.localStorage.getItem(themeStorageKey);
  if (storedTheme === "light" || storedTheme === "dark") {
    state.themeMode = storedTheme;
  }
  applyThemeMode();
}

function initializeKioskMode(): void {
  const storedKiosk = window.localStorage.getItem(kioskStorageKey);
  if (storedKiosk === "true" || storedKiosk === "false") {
    state.kioskMode = storedKiosk === "true";
  }
}

function initializeShellMenuPosition(): void {
  const storedPosition = window.localStorage.getItem(shellMenuPositionStorageKey);
  if (storedPosition === "left" || storedPosition === "top") {
    state.shellMenuPosition = storedPosition;
  }
}

function initializeAlarmSoundPreferences(): void {
  const storedEnabled = window.localStorage.getItem(alarmSoundEnabledStorageKey);
  if (storedEnabled === "true" || storedEnabled === "false") {
    state.alarmSoundEnabled = storedEnabled === "true";
  }

  const storedIncludeNormal = window.localStorage.getItem(alarmSoundIncludeNormalPriorityStorageKey);
  if (storedIncludeNormal === "true" || storedIncludeNormal === "false") {
    state.alarmSoundIncludeNormalPriority = storedIncludeNormal === "true";
  }
}

function applyThemeMode(): void {
  window.document.documentElement.dataset.theme = state.themeMode;
}

function render(immediate = false): void {
  if (!immediate) {
    if (renderBatchDepth > 0) {
      renderQueuedWhileBatch = true;
      return;
    }
    if (renderScheduled) {
      return;
    }

    renderScheduled = true;
    window.requestAnimationFrame(() => {
      renderScheduled = false;
      render(true);
    });
    return;
  }

  if (renderBatchDepth > 0) {
    renderQueuedWhileBatch = true;
    return;
  }

  const preservedDomState = captureDomState(root);
  root.innerHTML = renderApp();
  bindAppEvents(handlers);
  restoreDomState(root, preservedDomState);
  applyPendingOperatorFocus();
}

function setBusyState(key: string, label: string | null): void {
  const currentLabel = state.pendingOperations[key] ?? null;
  if (currentLabel === label) {
    return;
  }

  if (label) {
    state.pendingOperations = {
      ...state.pendingOperations,
      [key]: label
    };
  } else if (state.pendingOperations[key]) {
    const nextOperations = { ...state.pendingOperations };
    delete nextOperations[key];
    state.pendingOperations = nextOperations;
  }

  render();
}

function setSuccess(message: string | null): void {
  if (message === null) {
    return;
  }
  if (state.message === message && state.error === null) {
    return;
  }
  state.message = message;
  state.error = null;
}

function setFailure(message: string): void {
  if (state.error === message && state.message === null) {
    return;
  }
  state.error = message;
  state.message = null;
}

async function refreshWorkspace(successMessage: string | null): Promise<void> {
  setBusyState("workspace-refresh", "Arbeitsbereich wird aktualisiert");
  try {
    await runRenderBatch(async () => {
      await Promise.all([
        uiHandlers.fetchDashboard(null),
        shiftHandlers.fetchShiftPlanning(null),
        archiveHandlers.fetchReporting(null),
        ...(state.session?.user.roles.some((role) => role === "administrator" || role === "leitstellenleiter" || role === "operator")
          ? [archiveHandlers.fetchArchiveCases(null)]
          : []),
        siteHandlers.fetchOverview(null),
        siteHandlers.fetchSiteMarkers(null),
        ...(state.session?.user.roles.some((role) => role === "administrator" || role === "leitstellenleiter")
          ? [adminHandlers.fetchUserAdministration(null)]
          : []),
        alarmHandlers.fetchCatalogs(null),
        settingsHandlers.fetchWorkflowProfiles(null),
        alarmHandlers.fetchOpenAlarms(successMessage),
        disturbanceHandlers.fetchOpenDisturbances(null)
      ]);

      if (state.selectedAlarmDetail) {
        await alarmHandlers.refreshSelectedDetail(null);
      }
      if (state.selectedMonitoringDetail) {
        await disturbanceHandlers.refreshSelectedMonitoringDetail(null);
      }
    });
  } finally {
    setBusyState("workspace-refresh", null);
  }
}

async function runRenderBatch<T>(work: () => Promise<T>): Promise<T> {
  renderBatchDepth += 1;
  try {
    return await work();
  } finally {
    renderBatchDepth -= 1;
    if (renderBatchDepth === 0 && renderQueuedWhileBatch) {
      renderQueuedWhileBatch = false;
      render();
    }
  }
}
