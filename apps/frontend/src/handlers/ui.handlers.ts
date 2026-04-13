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
  applyThemeMode: () => void;
  armAlarmSound: () => Promise<void>;
  kioskStorageKey: string;
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
