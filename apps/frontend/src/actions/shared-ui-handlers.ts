import type { AppHandlers } from "./events.js";
import type { WorkspaceRouter } from "../navigation/router.js";

import { state } from "../state.js";

type SharedUiHandlerDeps = {
  alarmSoundEnabledStorageKey: string;
  alarmSoundIncludeNormalPriorityStorageKey: string;
  applyThemeMode: () => void;
  armAlarmSound: () => Promise<void>;
  playAlarmSoundPreview: () => Promise<void>;
  render: () => void;
  router: WorkspaceRouter;
  kioskStorageKey: string;
  themeStorageKey: string;
};

export function createSharedUiHandlers(
  deps: SharedUiHandlerDeps
): Pick<
  AppHandlers,
  | "navigateWorkspace"
  | "navigateLeitstelleMode"
  | "toggleLeitstelleNavigation"
  | "toggleTheme"
  | "toggleKiosk"
  | "toggleAlarmSound"
  | "toggleAlarmSoundIncludeNormalPriority"
  | "testAlarmSound"
> {
  return {
    navigateWorkspace(workspaceId: string): void {
      if (workspaceId === "settings") {
        state.selectedSettingsSection = "overview";
      }
      if (workspaceId === "leitstelle") {
        deps.router.navigateLeitstelleMode("alarms");
        deps.render();
        return;
      }
      deps.router.navigateWorkspace(workspaceId);
      deps.render();
    },
    navigateLeitstelleMode(mode: string): void {
      deps.router.navigateLeitstelleMode(mode);
      deps.render();
    },
    toggleLeitstelleNavigation(): void {
      state.leitstelleNavigationCollapsed = !state.leitstelleNavigationCollapsed;
      deps.render();
    },
    toggleTheme(): void {
      state.themeMode = state.themeMode === "dark" ? "light" : "dark";
      window.localStorage.setItem(deps.themeStorageKey, state.themeMode);
      deps.applyThemeMode();
      deps.render();
    },
    toggleKiosk(): void {
      state.kioskMode = !state.kioskMode;
      window.localStorage.setItem(deps.kioskStorageKey, state.kioskMode ? "true" : "false");
      deps.render();
    },
    toggleAlarmSound(): void {
      state.alarmSoundEnabled = !state.alarmSoundEnabled;
      window.localStorage.setItem(deps.alarmSoundEnabledStorageKey, state.alarmSoundEnabled ? "true" : "false");
      if (state.alarmSoundEnabled) {
        void deps.armAlarmSound();
      }
      deps.render();
    },
    toggleAlarmSoundIncludeNormalPriority(): void {
      state.alarmSoundIncludeNormalPriority = !state.alarmSoundIncludeNormalPriority;
      window.localStorage.setItem(
        deps.alarmSoundIncludeNormalPriorityStorageKey,
        state.alarmSoundIncludeNormalPriority ? "true" : "false"
      );
      deps.render();
    },
    async testAlarmSound(): Promise<void> {
      await deps.playAlarmSoundPreview();
      deps.render();
    }
  };
}
