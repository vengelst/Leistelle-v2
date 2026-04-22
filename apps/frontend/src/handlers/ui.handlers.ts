/**
 * Zusammenbau der allgemeinen UI-Handler.
 *
 * Hier werden fachneutrale Shell-, Navigations- und Komfortfunktionen
 * gebuendelt, die nicht zu einem einzelnen Leitstellen- oder Stammdatenmodul
 * gehoeren.
 */
import type { AppHandlers } from "../actions/events.js";
import type { HandlerRuntime } from "../actions/handler-runtime.js";
import type { WorkspaceRouter } from "../navigation/router.js";
import type { UiShellDescriptor } from "@leitstelle/contracts";

import { createDashboardHandlers } from "../actions/dashboard-handlers.js";
import { createSharedUiHandlers } from "../actions/shared-ui-handlers.js";
import { scrollToRegion } from "../utils.js";

type UiHandlerDeps = HandlerRuntime & {
  alarmSoundEnabledStorageKey: string;
  alarmSoundIncludeNormalPriorityStorageKey: string;
  falseAlarmCloseModeStorageKey: string;
  alarmTableHoverDelayStorageKey: string;
  alarmPipelineTableStorageKey: string;
  alarmScreenLayoutStorageKey: string;
  applyThemeMode: () => void;
  armAlarmSound: () => Promise<void>;
  broadcastOperatorLayoutUpdate: () => void;
  kioskStorageKey: string;
  shellMenuPositionStorageKey: string;
  openSecondaryOperatorWindow: () => void;
  playAlarmSoundPreview: () => Promise<void>;
  router: WorkspaceRouter;
  themeStorageKey: string;
};

export function createUiHandlers(
  deps: UiHandlerDeps
): Pick<
  AppHandlers,
  | "navigateWorkspace"
  | "navigateLeitstelleMode"
  | "navigateToRegion"
  | "toggleLeitstelleNavigation"
  | "toggleTheme"
  | "toggleKiosk"
  | "setShellMenuPosition"
  | "setFalseAlarmCloseMode"
  | "setAlarmTableHoverDelayMs"
  | "setAlarmPipelineTableColumnVisible"
  | "setAlarmPipelineTableColumnWidth"
  | "setAlarmPipelineTablePanelWidth"
  | "setAlarmScreenPanelPosition"
  | "setAlarmScreenPanelSize"
  | "openSecondaryOperatorWindow"
  | "toggleOperatorLayoutEditor"
  | "applyOperatorLayoutPreset"
  | "moveOperatorLayoutWidget"
  | "repositionOperatorLayoutWidget"
  | "updateOperatorLayoutWidgetWidth"
  | "updateOperatorLayoutWidgetHeight"
  | "updateOperatorLayoutDraftName"
  | "saveOperatorLayoutProfile"
  | "applyOperatorLayoutProfile"
  | "deleteOperatorLayoutProfile"
  | "toggleAlarmSound"
  | "toggleAlarmSoundIncludeNormalPriority"
  | "testAlarmSound"
  | "fetchDashboard"
> & {
  pollDashboard: () => Promise<boolean>;
} {
  const sharedUiHandlers = createSharedUiHandlers(deps);

  return {
    ...sharedUiHandlers,
    ...createDashboardHandlers(deps),
    navigateToRegion(regionId: UiShellDescriptor["regions"][number]["id"]): void {
      deps.router.navigateToRegion(regionId);
      scrollToRegion(regionId);
      deps.render();
    }
  };
}
