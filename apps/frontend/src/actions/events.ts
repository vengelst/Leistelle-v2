import type { AlarmCaseExportFormat, AlarmMediaAccessMode, UiShellDescriptor } from "@leitstelle/contracts";

import { bindLeafletMap } from "../leaflet-map.js";
import { state } from "../state.js";

export type AppHandlers = {
  navigateWorkspace: (workspaceId: string) => void;
  navigateLeitstelleMode: (mode: string) => void;
  navigateToRegion: (regionId: UiShellDescriptor["regions"][number]["id"]) => void;
  toggleLeitstelleNavigation: () => void;
  toggleTheme: () => void;
  toggleKiosk: () => void;
  toggleAlarmSound: () => void;
  toggleAlarmSoundIncludeNormalPriority: () => void;
  testAlarmSound: () => Promise<void>;
  handleLoginModeChange: (mode: string) => void;
  handleLogin: (event: SubmitEvent) => Promise<void>;
  handleLogout: () => Promise<void>;
  fetchOverview: (message: string | null) => Promise<void>;
  fetchDashboard: (message: string | null) => Promise<void>;
  fetchShiftPlanning: (message: string | null) => Promise<void>;
  handleReportingFilterSubmit: (event: SubmitEvent) => Promise<void>;
  handleReportingReset: () => Promise<void>;
  handleReportingExport: () => void;
  handleShiftPlanningFilterSubmit: (event: SubmitEvent) => Promise<void>;
  handleShiftPlanningReset: () => Promise<void>;
  handleShiftPlanningSubmit: (event: SubmitEvent) => Promise<void>;
  handleShiftPlanningEdit: (shiftId: string) => void;
  handleShiftPlanningEditorReset: () => void;
  handleArchiveFilterSubmit: (event: SubmitEvent) => Promise<void>;
  handleArchiveReset: () => Promise<void>;
  handleArchiveExport: () => void;
  fetchWorkflowProfiles: (message: string | null) => Promise<void>;
  fetchSiteMarkers: (message: string | null) => Promise<void>;
  fetchUserAdministration: (message: string | null) => Promise<void>;
  handleMapFocusSite: (siteId: string, scope: "both" | "alarms" | "monitoring") => Promise<void>;
  handleStatusAction: (path: string, successMessage: string) => Promise<void>;
  handleSettingsSectionChange: (section: string) => void;
  handleUserAdministrationSearchInput: (value: string) => void;
  handleUserAdministrationStatusFilterChange: (value: string) => void;
  handleUserAdministrationRoleFilterChange: (value: string) => void;
  handleUserAdministrationSelectUser: (userId: string) => void;
  handleUserAdministrationBackToList: () => void;
  handleUserAdministrationCreateUser: () => void;
  handleUserAdministrationEditUser: (userId: string) => void;
  handleUserAdministrationCancelEdit: () => void;
  handleUserAdministrationSubmit: (event: SubmitEvent) => Promise<void>;
  handleUserAdministrationToggleActive: (userId: string) => Promise<void>;
  handlePipelineFilterSubmit: (event: SubmitEvent) => Promise<void>;
  handlePipelineAssignmentScopeChange: (scope: string) => void;
  handlePipelineReset: () => Promise<void>;
  handleMonitoringFilterSubmit: (event: SubmitEvent) => Promise<void>;
  handleMonitoringReset: () => Promise<void>;
  handleDetailTimeContextChange: (event: Event) => Promise<void>;
  refreshSelectedDetail: (message: string | null) => Promise<void>;
  fetchAlarmReport: (message: string | null) => Promise<void>;
  handleDetailReserve: () => Promise<void>;
  handleDetailAcknowledge: () => Promise<void>;
  handleDetailRelease: () => Promise<void>;
  refreshSelectedMonitoringDetail: (message: string | null) => Promise<void>;
  handleMonitoringAcknowledgeSelected: () => Promise<void>;
  handleMonitoringNoteSubmit: (event: SubmitEvent) => Promise<void>;
  handleMonitoringServiceCaseSubmit: (event: SubmitEvent) => Promise<void>;
  handleQuickConfirm: () => Promise<void>;
  handleQuickFalsePositive: () => Promise<void>;
  handleArchive: () => Promise<void>;
  handleAssessmentSubmit: (event: SubmitEvent) => Promise<void>;
  handleFollowUpSubmit: (event: SubmitEvent) => Promise<void>;
  handleFollowUpClear: () => Promise<void>;
  handleActionSubmit: (event: SubmitEvent) => Promise<void>;
  handleCommentSubmit: (event: SubmitEvent) => Promise<void>;
  handleCloseSubmit: (event: SubmitEvent) => Promise<void>;
  handleQuickAction: (actionTypeId: string) => Promise<void>;
  handleAlarmExport: (format: AlarmCaseExportFormat) => Promise<void>;
  handleArchiveOpen: (alarmCaseId: string) => Promise<void>;
  handleAlarmMediaAccess: (mediaId: string, mode: AlarmMediaAccessMode) => Promise<void>;
  handleDetail: (alarmCaseId: string) => Promise<void>;
  handleOperatorAccept: (alarmCaseId: string) => Promise<void>;
  handleReserve: (alarmCaseId: string, options?: { override?: boolean }) => Promise<void>;
  handleRelease: (alarmCaseId: string) => Promise<void>;
  handleReassign: (event: SubmitEvent) => Promise<void>;
  handleMonitoringDetail: (disturbanceId: string) => Promise<void>;
  handleMonitoringAcknowledge: (disturbanceId: string) => Promise<void>;
  handleMapMarkerSelect: (siteId: string) => Promise<void>;
  handleMapOpenSiteDetails: (siteId: string) => void;
  handleSiteManagementSelectSite: (siteId: string) => void;
  handleSiteManagementBackToList: () => void;
  handleSiteManagementSectionChange: (section: string) => void;
  handleSiteManagementSearchInput: (value: string) => void;
  handleSiteManagementStatusFilterChange: (value: string) => void;
  handleSiteManagementShowArchivedToggle: (showArchived: boolean) => void;
  handleSiteManagementCreateSite: () => void;
  handleSiteManagementCancelSiteEdit: () => void;
  handleSiteManagementEditSite: (siteId: string) => void;
  handleSiteManagementToggleArchive: (siteId: string) => Promise<void>;
  handleSiteManagementCreateDevice: (deviceType?: string) => void;
  handleSiteManagementEditDevice: (deviceId: string) => void;
  handleSiteManagementDeviceTypeChange: (deviceType: string) => void;
  handleSiteManagementCloseDeviceModal: () => void;
  handleSiteManagementDeleteDevice: () => Promise<void>;
  handleSiteManagementEditAlarmSourceMapping: (mappingId: string) => void;
  handleSiteManagementCancelAlarmSourceMappingEdit: () => void;
  handleSiteManagementToggleAlarmSourceMapping: (mappingId: string) => Promise<void>;
  handleMapOpenAlarm: (alarmCaseId: string) => Promise<void>;
  handleMapOpenDisturbance: (disturbanceId: string) => Promise<void>;
  scrollToRegion: (regionId: UiShellDescriptor["regions"][number]["id"]) => void;
  handleSitePlanSelect: (siteId: string, planId: string) => void;
  handleSitePlanMarkerSelect: (siteId: string, planId: string, markerId: string) => void;
  handleSitePlanZoom: (planId: string, direction: -1 | 1) => void;
  handleSitePlanOpenSiteDetails: (siteId: string) => void;
  handleSitePlanOpenAlarm: (alarmCaseId: string) => Promise<void>;
  handleSitePlanOpenDisturbance: (disturbanceId: string) => Promise<void>;
  handleGlobalSettingsSubmit: (event: SubmitEvent) => Promise<void>;
  handleCustomerSubmit: (event: SubmitEvent) => Promise<void>;
  handleSiteSubmit: (event: SubmitEvent) => Promise<void>;
  handleDeviceSubmit: (event: SubmitEvent) => Promise<void>;
  handleAlarmSourceMappingSubmit: (event: SubmitEvent) => Promise<void>;
  handlePlanSubmit: (event: SubmitEvent) => Promise<void>;
  handleWorkflowProfileSubmit: (event: SubmitEvent) => Promise<void>;
};

let activeDeviceModalBackdrop: {
  element: EventTarget;
  listener: (event: Event) => void;
} | null = null;

let activeDeviceModalEscapeListener: ((event: KeyboardEvent) => void) | null = null;
let activeOperatorKeyboardListener: ((event: KeyboardEvent) => void) | null = null;
type OperatorFocusRequest =
  | { zone: "list" | "detail" | "actions" }
  | { zone: "list-entry"; alarmCaseId: string };

let pendingOperatorFocusRequest: OperatorFocusRequest | null = null;

export function bindDeviceModalCloseInteractions(
  handlers: Pick<AppHandlers, "handleSiteManagementCloseDeviceModal">
): void {
  if (activeDeviceModalBackdrop) {
    activeDeviceModalBackdrop.element.removeEventListener("click", activeDeviceModalBackdrop.listener);
    activeDeviceModalBackdrop = null;
  }

  if (activeDeviceModalEscapeListener) {
    document.removeEventListener("keydown", activeDeviceModalEscapeListener);
    activeDeviceModalEscapeListener = null;
  }

  const backdrop = document.querySelector<HTMLElement>(".site-management-modal-backdrop");
  if (!backdrop) {
    return;
  }

  const backdropClickListener = (event: Event) => {
    if (event.target === event.currentTarget) {
      handlers.handleSiteManagementCloseDeviceModal();
    }
  };
  backdrop.addEventListener("click", backdropClickListener);
  activeDeviceModalBackdrop = {
    element: backdrop,
    listener: backdropClickListener
  };

  const escapeListener = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      handlers.handleSiteManagementCloseDeviceModal();
    }
  };
  document.addEventListener("keydown", escapeListener);
  activeDeviceModalEscapeListener = escapeListener;
}

export function applyPendingOperatorFocus(): void {
  if (!pendingOperatorFocusRequest) {
    return;
  }

  const request = pendingOperatorFocusRequest;
  pendingOperatorFocusRequest = null;

  if (request.zone === "list-entry") {
    const selector = `[data-operator-entry-button="true"][data-alarm-case-id="${escapeSelectorValue(request.alarmCaseId)}"]`;
    const entryButton = document.querySelector<HTMLElement>(selector);
    if (entryButton) {
      entryButton.focus();
      return;
    }
  }

  focusOperatorZone(request.zone === "list-entry" ? "list" : request.zone);
}

function bindOperatorKeyboardInteractions(): void {
  if (activeOperatorKeyboardListener) {
    document.removeEventListener("keydown", activeOperatorKeyboardListener);
    activeOperatorKeyboardListener = null;
  }

  if (!document.querySelector("[data-operator-keyboard-root=\"true\"]")) {
    return;
  }

  const keyboardListener = (event: KeyboardEvent) => {
    if (isEditableKeyboardTarget(event.target)) {
      return;
    }

    if (!event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && event.key === "Escape") {
      if (hasBlockingDialogOpen()) {
        return;
      }
      event.preventDefault();
      if (!focusActiveOperatorEntry()) {
        focusOperatorZone("list");
      }
      return;
    }

    if (event.defaultPrevented || event.altKey || event.metaKey || !event.ctrlKey || !event.shiftKey) {
      return;
    }

    const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;

    switch (normalizedKey) {
      case "1":
        event.preventDefault();
        focusOperatorZone("list");
        return;
      case "2":
        event.preventDefault();
        focusOperatorZone("detail");
        return;
      case "3":
        event.preventDefault();
        focusOperatorZone("actions");
        return;
      case "ArrowDown":
        event.preventDefault();
        moveOperatorEntryFocus(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        moveOperatorEntryFocus(-1);
        return;
      case "Enter":
        event.preventDefault();
        if (!event.repeat) {
          triggerActiveOperatorEntry();
        }
        return;
      case "r":
        event.preventDefault();
        if (!event.repeat && !hasBlockingOperatorPendingOperation()) {
          triggerReserveShortcut();
        }
        return;
      case "q":
        event.preventDefault();
        if (!event.repeat && !hasBlockingOperatorPendingOperation()) {
          triggerButtonSelector("#detail-acknowledge-button");
        }
        return;
      case "e":
        event.preventDefault();
        if (!event.repeat && !hasBlockingOperatorPendingOperation()) {
          triggerButtonSelector('.quick-action-button[data-action-type-id="action-call-security"]');
        }
        return;
      case "c":
        event.preventDefault();
        if (!event.repeat) {
          focusCloseFormControl();
        }
        return;
      case "f":
        event.preventDefault();
        if (!event.repeat) {
          focusOperatorFilterControl();
        }
        return;
      default:
        return;
    }
  };

  document.addEventListener("keydown", keyboardListener);
  activeOperatorKeyboardListener = keyboardListener;
}

function focusOperatorZone(zone: "list" | "detail" | "actions"): void {
  const target = document.querySelector<HTMLElement>(`[data-operator-focus-zone="${zone}"]`);
  target?.focus();
}

function hasBlockingDialogOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
}

function hasBlockingOperatorPendingOperation(): boolean {
  const blockingKeys = [
    "open-alarms",
    "alarm-detail",
    "alarm-operator-accept",
    "alarm-reserve",
    "alarm-release",
    "alarm-reassign",
    "alarm-acknowledge",
    "alarm-close",
    "alarm-archive",
    "alarm-quick-action"
  ] as const;
  return blockingKeys.some((key) => Boolean(state.pendingOperations[key]));
}

function isDisabledShortcutTarget(target: { hasAttribute?: (name: string) => boolean } | null | undefined): boolean {
  return Boolean(target && typeof target.hasAttribute === "function" && target.hasAttribute("disabled"));
}

function triggerClick(target: { click?: () => void; hasAttribute?: (name: string) => boolean } | null | undefined): boolean {
  if (!target || isDisabledShortcutTarget(target) || typeof target.click !== "function") {
    return false;
  }
  target.click();
  return true;
}

function getActiveOperatorEntry(preferEnabled = true): {
  click?: () => void;
  focus?: () => void;
  hasAttribute?: (name: string) => boolean;
  dataset?: { alarmCaseId?: string };
} | null {
  const activeElement = document.activeElement as
    | {
        click?: () => void;
        focus?: () => void;
        hasAttribute?: (name: string) => boolean;
        dataset?: { alarmCaseId?: string; operatorEntryButton?: string };
      }
    | null;

  if (activeElement?.dataset?.operatorEntryButton === "true" && (!preferEnabled || !isDisabledShortcutTarget(activeElement))) {
    return activeElement;
  }

  const selected = document.querySelector('[data-operator-entry-button="true"][aria-current="true"]') as
    | {
        click?: () => void;
        focus?: () => void;
        hasAttribute?: (name: string) => boolean;
        dataset?: { alarmCaseId?: string };
      }
    | null;
  if (selected && (!preferEnabled || !isDisabledShortcutTarget(selected))) {
    return selected;
  }

  const firstAvailable = (Array.from(document.querySelectorAll('[data-operator-entry-button="true"]')) as Array<{
    click?: () => void;
    focus?: () => void;
    hasAttribute?: (name: string) => boolean;
    dataset?: { alarmCaseId?: string };
  }>).find((entry) => !preferEnabled || !isDisabledShortcutTarget(entry));

  return firstAvailable ?? null;
}

function focusActiveOperatorEntry(): boolean {
  const entry = getActiveOperatorEntry(false);
  if (!entry || typeof entry.focus !== "function") {
    return false;
  }
  entry.focus();
  return true;
}

function triggerActiveOperatorEntry(): boolean {
  return triggerClick(getActiveOperatorEntry(true));
}

function triggerButtonSelector(selector: string): boolean {
  return triggerClick(document.querySelector(selector));
}

function triggerReserveShortcut(): boolean {
  if (triggerButtonSelector("#detail-reserve-button")) {
    return true;
  }

  const alarmCaseId = getActiveOperatorEntry(false)?.dataset?.alarmCaseId;
  if (!alarmCaseId) {
    return false;
  }

  return triggerButtonSelector(`.reserve-button[data-alarm-case-id="${escapeSelectorValue(alarmCaseId)}"]`);
}

function focusOperatorFilterControl(): boolean {
  const target = document.querySelector<HTMLElement>(
    '[data-pipeline-assignment-scope][aria-pressed="true"], [data-pipeline-assignment-scope], #pipeline-filter-form select, #pipeline-filter-form input, #pipeline-filter-form button'
  );
  target?.focus();
  return Boolean(target);
}

function focusCloseFormControl(): boolean {
  const target = document.querySelector<HTMLElement>('#close-form select, #close-form input, #close-form button[type="submit"]');
  if (!target || isDisabledShortcutTarget(target)) {
    return false;
  }
  target.focus();
  return true;
}

function moveOperatorEntryFocus(direction: -1 | 1): void {
  const entryButtons = Array.from(document.querySelectorAll<HTMLElement>("[data-operator-entry-button=\"true\"]"))
    .filter((element) => !element.hasAttribute("disabled"));
  if (entryButtons.length === 0) {
    return;
  }

  const activeElement = document.activeElement as HTMLElement | null;
  const activeIndex = activeElement ? entryButtons.indexOf(activeElement) : -1;
  const selectedAlarmCaseId = document.querySelector<HTMLElement>("[data-operator-entry-button=\"true\"][aria-current=\"true\"]")?.dataset.alarmCaseId;
  const selectedIndex = selectedAlarmCaseId
    ? entryButtons.findIndex((element) => element.dataset.alarmCaseId === selectedAlarmCaseId)
    : -1;

  const currentIndex = activeIndex >= 0 ? activeIndex : selectedIndex >= 0 ? selectedIndex : 0;
  const nextIndex = Math.max(0, Math.min(entryButtons.length - 1, currentIndex + direction));
  entryButtons[nextIndex]?.focus();
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return (typeof HTMLInputElement !== "undefined" && target instanceof HTMLInputElement)
    || (typeof HTMLTextAreaElement !== "undefined" && target instanceof HTMLTextAreaElement)
    || (typeof HTMLSelectElement !== "undefined" && target instanceof HTMLSelectElement)
    || (typeof HTMLElement !== "undefined" && target instanceof HTMLElement && target.isContentEditable);
}

function setPendingOperatorFocusRequest(request: OperatorFocusRequest): void {
  pendingOperatorFocusRequest = request;
}

function escapeSelectorValue(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/"/g, '\\"');
}

export function bindAppEvents(handlers: AppHandlers): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".workspace-nav-button"))) {
    button.addEventListener("click", () => handlers.navigateWorkspace(button.dataset.workspaceId ?? "dashboard"));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".operator-mode-button"))) {
    button.addEventListener("click", () => handlers.navigateLeitstelleMode(button.dataset.leitstelleMode ?? "overview"));
  }
  document.querySelector<HTMLButtonElement>("#leitstelle-nav-toggle-button")?.addEventListener("click", () => handlers.toggleLeitstelleNavigation());
  document.querySelector<HTMLButtonElement>("#theme-toggle-button")?.addEventListener("click", () => handlers.toggleTheme());
  document.querySelector<HTMLButtonElement>("#kiosk-toggle-button")?.addEventListener("click", () => handlers.toggleKiosk());
  document.querySelector<HTMLButtonElement>("#alarm-sound-toggle-button")?.addEventListener("click", () => handlers.toggleAlarmSound());
  document.querySelector<HTMLButtonElement>("#alarm-sound-normal-toggle-button")?.addEventListener("click", () => handlers.toggleAlarmSoundIncludeNormalPriority());
  document.querySelector<HTMLButtonElement>("#alarm-sound-test-button")?.addEventListener("click", () => void handlers.testAlarmSound());
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".login-mode-button"))) {
    button.addEventListener("click", () => handlers.handleLoginModeChange(button.dataset.loginMode ?? "password"));
  }
  document.querySelector<HTMLFormElement>("#login-form")?.addEventListener("submit", handlers.handleLogin);
  document.querySelector<HTMLButtonElement>("#login-password-toggle-button")?.addEventListener("click", toggleLoginPasswordVisibility);
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".logout-button"))) {
    button.addEventListener("click", () => void handlers.handleLogout());
  }
  document.querySelector<HTMLButtonElement>("#refresh-overview-button")?.addEventListener("click", () => void handlers.fetchOverview("Stammdaten geladen."));
  document.querySelector<HTMLButtonElement>("#refresh-dashboard-button")?.addEventListener("click", () => void handlers.fetchDashboard("Dashboard geladen."));
  document.querySelector<HTMLButtonElement>("#refresh-shift-planning-button")?.addEventListener("click", () => void handlers.fetchShiftPlanning("Schichtplanung geladen."));
  document.querySelector<HTMLFormElement>("#reporting-filter-form")?.addEventListener("submit", handlers.handleReportingFilterSubmit);
  document.querySelector<HTMLButtonElement>("#reporting-reset-button")?.addEventListener("click", () => void handlers.handleReportingReset());
  document.querySelector<HTMLButtonElement>("#reporting-export-button")?.addEventListener("click", () => handlers.handleReportingExport());
  document.querySelector<HTMLFormElement>("#shift-planning-filter-form")?.addEventListener("submit", handlers.handleShiftPlanningFilterSubmit);
  document.querySelector<HTMLButtonElement>("#shift-planning-reset-button")?.addEventListener("click", () => void handlers.handleShiftPlanningReset());
  document.querySelector<HTMLFormElement>("#shift-planning-form")?.addEventListener("submit", handlers.handleShiftPlanningSubmit);
  document.querySelector<HTMLButtonElement>("#shift-planning-editor-reset-button")?.addEventListener("click", () => handlers.handleShiftPlanningEditorReset());
  document.querySelector<HTMLFormElement>("#archive-filter-form")?.addEventListener("submit", handlers.handleArchiveFilterSubmit);
  document.querySelector<HTMLButtonElement>("#archive-reset-button")?.addEventListener("click", () => void handlers.handleArchiveReset());
  document.querySelector<HTMLButtonElement>("#archive-export-button")?.addEventListener("click", () => handlers.handleArchiveExport());
  document.querySelector<HTMLButtonElement>("#refresh-instructions-button")?.addEventListener("click", () => void handlers.fetchWorkflowProfiles("Einsatzanweisungen geladen."));
  document.querySelector<HTMLButtonElement>("#refresh-user-administration-button")?.addEventListener("click", () => void handlers.fetchUserAdministration("Benutzerverwaltung geladen."));
  document.querySelector<HTMLButtonElement>("#refresh-map-button")?.addEventListener("click", () => void handlers.fetchSiteMarkers("Karte aktualisiert."));
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".settings-section-button, .settings-overview-link"))) {
    button.addEventListener("click", () => handlers.handleSettingsSectionChange(button.dataset.settingsSection ?? "overview"));
  }
  document.querySelector<HTMLButtonElement>("#focus-site-button")?.addEventListener("click", () => void handlers.handleMapFocusSite(document.querySelector<HTMLButtonElement>("#focus-site-button")?.dataset.siteId ?? "", "both"));
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".status-action-button"))) {
    button.addEventListener("click", () => void handlers.handleStatusAction(
      button.dataset.statusPath ?? "/api/v1/auth/status/active",
      button.dataset.successMessage ?? "Status aktualisiert."
    ));
  }
  document.querySelector<HTMLInputElement>("#user-administration-search-input")?.addEventListener("input", (event) => {
    handlers.handleUserAdministrationSearchInput((event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLSelectElement>("#user-administration-status-filter")?.addEventListener("change", (event) => {
    handlers.handleUserAdministrationStatusFilterChange((event.currentTarget as HTMLSelectElement).value);
  });
  document.querySelector<HTMLSelectElement>("#user-administration-role-filter")?.addEventListener("change", (event) => {
    handlers.handleUserAdministrationRoleFilterChange((event.currentTarget as HTMLSelectElement).value);
  });
  document.querySelector<HTMLButtonElement>("#user-administration-back-button")?.addEventListener("click", () => handlers.handleUserAdministrationBackToList());
  document.querySelector<HTMLButtonElement>("#user-administration-create-button")?.addEventListener("click", () => handlers.handleUserAdministrationCreateUser());
  document.querySelector<HTMLButtonElement>("#user-administration-cancel-edit-button")?.addEventListener("click", () => handlers.handleUserAdministrationCancelEdit());
  document.querySelector<HTMLFormElement>("#user-administration-form")?.addEventListener("submit", handlers.handleUserAdministrationSubmit);
  bindUserAvatarControls();
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".user-administration-select-button"))) {
    button.addEventListener("click", () => handlers.handleUserAdministrationSelectUser(button.dataset.userId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".user-administration-edit-button"))) {
    button.addEventListener("click", () => handlers.handleUserAdministrationEditUser(button.dataset.userId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".user-administration-toggle-active-button"))) {
    button.addEventListener("click", () => void handlers.handleUserAdministrationToggleActive(button.dataset.userId ?? ""));
  }
  document.querySelector<HTMLFormElement>("#pipeline-filter-form")?.addEventListener("submit", handlers.handlePipelineFilterSubmit);
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-pipeline-assignment-scope]"))) {
    button.addEventListener("click", () => handlers.handlePipelineAssignmentScopeChange(button.dataset.pipelineAssignmentScope ?? "all"));
  }
  document.querySelector<HTMLButtonElement>("#pipeline-reset-button")?.addEventListener("click", () => void handlers.handlePipelineReset());
  document.querySelector<HTMLFormElement>("#monitoring-filter-form")?.addEventListener("submit", handlers.handleMonitoringFilterSubmit);
  document.querySelector<HTMLButtonElement>("#monitoring-reset-button")?.addEventListener("click", () => void handlers.handleMonitoringReset());
  document.querySelector<HTMLSelectElement>("#detail-time-context")?.addEventListener("change", handlers.handleDetailTimeContextChange);
  document.querySelector<HTMLButtonElement>("#detail-refresh-button")?.addEventListener("click", () => {
    setPendingOperatorFocusRequest({ zone: "detail" });
    void handlers.refreshSelectedDetail("Alarmkontext geladen.");
  });
  document.querySelector<HTMLButtonElement>("#detail-report-refresh-button")?.addEventListener("click", () => {
    setPendingOperatorFocusRequest({ zone: "detail" });
    void handlers.fetchAlarmReport("Fallbericht geladen.");
  });
  document.querySelector<HTMLButtonElement>("#detail-reserve-button")?.addEventListener("click", () => {
    setPendingOperatorFocusRequest({ zone: "actions" });
    void handlers.handleDetailReserve();
  });
  document.querySelector<HTMLButtonElement>("#detail-acknowledge-button")?.addEventListener("click", () => {
    setPendingOperatorFocusRequest({ zone: "actions" });
    void handlers.handleDetailAcknowledge();
  });
  document.querySelector<HTMLButtonElement>("#detail-release-button")?.addEventListener("click", () => {
    setPendingOperatorFocusRequest({ zone: "actions" });
    void handlers.handleDetailRelease();
  });
  document.querySelector<HTMLButtonElement>("#monitoring-detail-refresh-button")?.addEventListener("click", () => void handlers.refreshSelectedMonitoringDetail("Stoerungsdetail geladen."));
  document.querySelector<HTMLButtonElement>("#monitoring-ack-button")?.addEventListener("click", () => void handlers.handleMonitoringAcknowledgeSelected());
  document.querySelector<HTMLFormElement>("#monitoring-note-form")?.addEventListener("submit", handlers.handleMonitoringNoteSubmit);
  document.querySelector<HTMLFormElement>("#monitoring-service-case-form")?.addEventListener("submit", handlers.handleMonitoringServiceCaseSubmit);
  document.querySelector<HTMLButtonElement>("#quick-confirm-button")?.addEventListener("click", () => {
    setPendingOperatorFocusRequest({ zone: "actions" });
    void handlers.handleQuickConfirm();
  });
  document.querySelector<HTMLButtonElement>("#quick-false-positive-button")?.addEventListener("click", () => {
    setPendingOperatorFocusRequest({ zone: "actions" });
    void handlers.handleQuickFalsePositive();
  });
  document.querySelector<HTMLButtonElement>("#archive-button")?.addEventListener("click", () => {
    setPendingOperatorFocusRequest({ zone: "actions" });
    void handlers.handleArchive();
  });
  document.querySelector<HTMLFormElement>("#assessment-form")?.addEventListener("submit", handlers.handleAssessmentSubmit);
  document.querySelector<HTMLFormElement>("#follow-up-form")?.addEventListener("submit", handlers.handleFollowUpSubmit);
  document.querySelector<HTMLButtonElement>("#follow-up-clear-button")?.addEventListener("click", () => void handlers.handleFollowUpClear());
  document.querySelector<HTMLFormElement>("#action-form")?.addEventListener("submit", handlers.handleActionSubmit);
  document.querySelector<HTMLFormElement>("#comment-form")?.addEventListener("submit", handlers.handleCommentSubmit);
  document.querySelector<HTMLFormElement>("#close-form")?.addEventListener("submit", handlers.handleCloseSubmit);

  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".quick-action-button"))) {
    button.addEventListener("click", () => void handlers.handleQuickAction(button.dataset.actionTypeId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".detail-export-button"))) {
    button.addEventListener("click", () => void handlers.handleAlarmExport((button.dataset.format ?? "case_report") as AlarmCaseExportFormat));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".archive-open-button"))) {
    button.addEventListener("click", () => void handlers.handleArchiveOpen(button.dataset.alarmCaseId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".alarm-media-preview-button"))) {
    button.addEventListener("click", () => void handlers.handleAlarmMediaAccess(button.dataset.mediaId ?? "", "inline"));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".alarm-media-download-button"))) {
    button.addEventListener("click", () => void handlers.handleAlarmMediaAccess(button.dataset.mediaId ?? "", "download"));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".detail-button"))) {
    button.addEventListener("click", () => {
      setPendingOperatorFocusRequest({ zone: "detail" });
      void handlers.handleDetail(button.dataset.alarmCaseId ?? "");
    });
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".operator-accept-button"))) {
    button.addEventListener("click", () => {
      setPendingOperatorFocusRequest({ zone: "detail" });
      void handlers.handleOperatorAccept(button.dataset.alarmCaseId ?? "");
    });
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".reserve-button"))) {
    button.addEventListener("click", () => {
      setPendingOperatorFocusRequest({ zone: "list-entry", alarmCaseId: button.dataset.alarmCaseId ?? "" });
      void handlers.handleReserve(button.dataset.alarmCaseId ?? "");
    });
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".release-button"))) {
    button.addEventListener("click", () => {
      setPendingOperatorFocusRequest({ zone: "list-entry", alarmCaseId: button.dataset.alarmCaseId ?? "" });
      void handlers.handleRelease(button.dataset.alarmCaseId ?? "");
    });
  }
  for (const form of Array.from(document.querySelectorAll<HTMLFormElement>(".assignment-form"))) {
    form.addEventListener("submit", handlers.handleReassign);
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".monitoring-detail-button"))) {
    button.addEventListener("click", () => void handlers.handleMonitoringDetail(button.dataset.disturbanceId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".monitoring-ack-button"))) {
    button.addEventListener("click", () => void handlers.handleMonitoringAcknowledge(button.dataset.disturbanceId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".map-marker-button"))) {
    button.addEventListener("click", () => void handlers.handleMapMarkerSelect(button.dataset.siteId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".map-focus-button"))) {
    button.addEventListener("click", () => void handlers.handleMapFocusSite(button.dataset.siteId ?? "", "both"));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".map-alarm-focus-button"))) {
    button.addEventListener("click", () => void handlers.handleMapFocusSite(button.dataset.siteId ?? "", "alarms"));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".map-monitoring-focus-button"))) {
    button.addEventListener("click", () => void handlers.handleMapFocusSite(button.dataset.siteId ?? "", "monitoring"));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".map-site-details-button"))) {
    button.addEventListener("click", () => handlers.handleMapOpenSiteDetails(button.dataset.siteId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".site-management-site-select-button"))) {
    button.addEventListener("click", () => handlers.handleSiteManagementSelectSite(button.dataset.siteId ?? ""));
  }
  document.querySelector<HTMLButtonElement>("#site-management-back-button")?.addEventListener("click", () => handlers.handleSiteManagementBackToList());
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".site-management-section-button"))) {
    button.addEventListener("click", () => handlers.handleSiteManagementSectionChange(button.dataset.siteSection ?? "overview"));
  }
  document.querySelector<HTMLInputElement>("#site-management-search-input")?.addEventListener("input", (event) => {
    handlers.handleSiteManagementSearchInput((event.currentTarget as HTMLInputElement).value);
  });
  document.querySelector<HTMLSelectElement>("#site-management-status-filter")?.addEventListener("change", (event) => {
    handlers.handleSiteManagementStatusFilterChange((event.currentTarget as HTMLSelectElement).value);
  });
  document.querySelector<HTMLInputElement>("#site-management-show-archived-toggle")?.addEventListener("change", (event) => {
    handlers.handleSiteManagementShowArchivedToggle((event.currentTarget as HTMLInputElement).checked);
  });
  document.querySelector<HTMLButtonElement>("#site-management-create-site-button")?.addEventListener("click", () => handlers.handleSiteManagementCreateSite());
  document.querySelector<HTMLButtonElement>("#site-management-cancel-site-edit-button")?.addEventListener("click", () => handlers.handleSiteManagementCancelSiteEdit());
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".site-management-edit-site-button"))) {
    button.addEventListener("click", () => handlers.handleSiteManagementEditSite(button.dataset.siteId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".site-management-toggle-archive-button"))) {
    button.addEventListener("click", () => void handlers.handleSiteManagementToggleArchive(button.dataset.siteId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".site-management-create-device-button"))) {
    button.addEventListener("click", () => handlers.handleSiteManagementCreateDevice(button.dataset.deviceType));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".site-management-edit-device-button"))) {
    button.addEventListener("click", () => handlers.handleSiteManagementEditDevice(button.dataset.deviceId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".site-management-edit-alarm-source-mapping-button"))) {
    button.addEventListener("click", () => handlers.handleSiteManagementEditAlarmSourceMapping(button.dataset.mappingId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".site-management-toggle-alarm-source-mapping-button"))) {
    button.addEventListener("click", () => void handlers.handleSiteManagementToggleAlarmSourceMapping(button.dataset.mappingId ?? ""));
  }
  document.querySelector<HTMLButtonElement>("#site-management-cancel-alarm-source-mapping-edit-button")
    ?.addEventListener("click", () => handlers.handleSiteManagementCancelAlarmSourceMappingEdit());
  document.querySelector<HTMLSelectElement>("#site-management-device-type-select")?.addEventListener("change", (event) => {
    handlers.handleSiteManagementDeviceTypeChange((event.currentTarget as HTMLSelectElement).value);
  });
  document.querySelector<HTMLButtonElement>("#site-management-device-modal-close-button")?.addEventListener("click", () => handlers.handleSiteManagementCloseDeviceModal());
  document.querySelector<HTMLButtonElement>("#site-management-device-modal-cancel-button")?.addEventListener("click", () => handlers.handleSiteManagementCloseDeviceModal());
  document.querySelector<HTMLButtonElement>("#site-management-device-delete-button")?.addEventListener("click", () => void handlers.handleSiteManagementDeleteDevice());
  bindDeviceModalCloseInteractions(handlers);
  bindOperatorKeyboardInteractions();
  bindLeafletMap({
    handleMapMarkerSelect: handlers.handleMapMarkerSelect
  });
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".map-open-first-alarm-button, .map-open-alarm-button"))) {
    button.addEventListener("click", () => void handlers.handleMapOpenAlarm(button.dataset.alarmCaseId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".map-open-first-disturbance-button, .map-open-disturbance-button, .map-open-service-context-button"))) {
    button.addEventListener("click", () => void handlers.handleMapOpenDisturbance(button.dataset.disturbanceId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".dashboard-open-alarm-button"))) {
    button.addEventListener("click", () => void handlers.handleMapOpenAlarm(button.dataset.alarmCaseId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".dashboard-open-disturbance-button"))) {
    button.addEventListener("click", () => void handlers.handleMapOpenDisturbance(button.dataset.disturbanceId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".dashboard-focus-site-button"))) {
    button.addEventListener("click", () => {
      handlers.navigateWorkspace("map");
      void handlers.handleMapFocusSite(button.dataset.siteId ?? "", "both");
    });
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".dashboard-jump-button"))) {
    button.addEventListener("click", () => {
      const regionId = (button.dataset.regionId ?? "dashboard") as UiShellDescriptor["regions"][number]["id"];
      handlers.navigateToRegion(regionId);
    });
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".shift-edit-button"))) {
    button.addEventListener("click", () => handlers.handleShiftPlanningEdit(button.dataset.shiftId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".site-plan-select-button"))) {
    button.addEventListener("click", () => handlers.handleSitePlanSelect(button.dataset.siteId ?? "", button.dataset.planId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".site-plan-marker"))) {
    button.addEventListener("click", () => handlers.handleSitePlanMarkerSelect(
      button.dataset.siteId ?? "",
      button.dataset.planId ?? "",
      button.dataset.markerId ?? ""
    ));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".site-plan-zoom-button"))) {
    button.addEventListener("click", () => handlers.handleSitePlanZoom(button.dataset.planId ?? "", button.dataset.direction === "out" ? -1 : 1));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".site-plan-open-site-details-button"))) {
    button.addEventListener("click", () => handlers.handleSitePlanOpenSiteDetails(button.dataset.siteId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".site-plan-open-alarm-button"))) {
    button.addEventListener("click", () => void handlers.handleSitePlanOpenAlarm(button.dataset.alarmCaseId ?? ""));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".site-plan-open-disturbance-button"))) {
    button.addEventListener("click", () => void handlers.handleSitePlanOpenDisturbance(button.dataset.disturbanceId ?? ""));
  }
  document.querySelector<HTMLFormElement>("#global-settings-form")?.addEventListener("submit", handlers.handleGlobalSettingsSubmit);
  document.querySelector<HTMLFormElement>("#customer-form")?.addEventListener("submit", handlers.handleCustomerSubmit);
  document.querySelector<HTMLFormElement>("#site-form")?.addEventListener("submit", handlers.handleSiteSubmit);
  document.querySelector<HTMLFormElement>("#device-form")?.addEventListener("submit", handlers.handleDeviceSubmit);
  document.querySelector<HTMLFormElement>("#alarm-source-mapping-form")?.addEventListener("submit", handlers.handleAlarmSourceMappingSubmit);
  document.querySelector<HTMLFormElement>("#plan-form")?.addEventListener("submit", handlers.handlePlanSubmit);
  document.querySelector<HTMLFormElement>("#workflow-profile-form")?.addEventListener("submit", handlers.handleWorkflowProfileSubmit);
}

function toggleLoginPasswordVisibility(): void {
  const passwordInput = document.querySelector<HTMLInputElement>("#login-password-input");
  const toggleButton = document.querySelector<HTMLButtonElement>("#login-password-toggle-button");
  if (!passwordInput || !toggleButton) {
    return;
  }

  const nextVisible = passwordInput.type === "password";
  passwordInput.type = nextVisible ? "text" : "password";
  toggleButton.dataset.passwordVisible = nextVisible ? "true" : "false";
  toggleButton.setAttribute("aria-pressed", nextVisible ? "true" : "false");
  toggleButton.setAttribute("aria-label", nextVisible ? "Passwort verbergen" : "Passwort anzeigen");
  toggleButton.innerHTML = nextVisible ? renderEyeOffIcon() : renderEyeIcon();
  passwordInput.focus();
}

function bindUserAvatarControls(): void {
  const form = document.querySelector<HTMLFormElement>("#user-administration-form");
  const fileInput = form?.querySelector<HTMLInputElement>("input[name=\"avatarFile\"]");
  const hiddenInput = form?.querySelector<HTMLInputElement>("input[name=\"avatarDataUrl\"]");
  const removeInput = form?.querySelector<HTMLInputElement>("input[name=\"avatarRemove\"]");
  const removeButton = form?.querySelector<HTMLButtonElement>(".user-avatar-remove-button");
  const getPreview = () => form?.querySelector<HTMLElement>(".user-admin-avatar-preview") ?? null;

  if (!form || !fileInput || !hiddenInput || !removeInput || !getPreview() || !removeButton) {
    return;
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      window.alert("Bitte ein Bild auswaehlen.");
      fileInput.value = "";
      return;
    }

    if (file.size > 260000) {
      window.alert("Bitte ein kleineres Bild verwenden (max. ca. 250 KB).");
      fileInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        return;
      }

      hiddenInput.value = result;
      removeInput.value = "false";
      const preview = getPreview();
      if (preview) {
        updateUserAvatarPreview(preview, result);
      }
    });
    reader.readAsDataURL(file);
  });

  removeButton.addEventListener("click", () => {
    hiddenInput.value = "";
    removeInput.value = "true";
    fileInput.value = "";
    const preview = getPreview();
    if (preview) {
      updateUserAvatarPreview(preview, "");
    }
  });
}

function updateUserAvatarPreview(preview: HTMLElement, avatarDataUrl: string): void {
  if (preview instanceof HTMLImageElement) {
    if (avatarDataUrl) {
      preview.src = avatarDataUrl;
    } else {
      preview.replaceWith(buildAvatarFallbackElement(preview.className));
    }
    return;
  }

  if (avatarDataUrl) {
    const image = document.createElement("img");
    image.className = preview.className;
    image.alt = "Benutzerbild Vorschau";
    image.src = avatarDataUrl;
    preview.replaceWith(image);
  }
}

function buildAvatarFallbackElement(className: string): HTMLSpanElement {
  const fallback = document.createElement("span");
  fallback.className = `${className} user-admin-avatar-fallback`.trim();
  fallback.setAttribute("aria-hidden", "true");
  fallback.textContent = "U";
  return fallback;
}

function renderEyeIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon-eye">
      <path d="M1.5 12s3.6-6 10.5-6 10.5 6 10.5 6-3.6 6-10.5 6S1.5 12 1.5 12Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
    </svg>
  `.trim();
}

function renderEyeOffIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon-eye">
      <path d="M1.5 12s3.6-6 10.5-6 10.5 6 10.5 6-3.6 6-10.5 6S1.5 12 1.5 12Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
      <path d="M4 20 20 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
    </svg>
  `.trim();
}
