import type { AppHandlers } from "./events.js";
import type { WorkspaceRouter } from "../navigation/router.js";

import {
  createOperatorLayoutProfile,
  createOperatorLayoutPreset,
  defaultOperatorLayoutDraftName,
  moveOperatorLayoutWidget,
  operatorLayoutWidgetIds,
  repositionOperatorLayoutWidget,
  savePersistedOperatorLayoutBundle,
  updateOperatorLayoutWidgetHeight,
  updateOperatorLayoutWidgetWidth
} from "../operator-layout.js";
import { state } from "../state.js";

type SharedUiHandlerDeps = {
  alarmSoundEnabledStorageKey: string;
  alarmSoundIncludeNormalPriorityStorageKey: string;
  applyThemeMode: () => void;
  armAlarmSound: () => Promise<void>;
  broadcastOperatorLayoutUpdate: () => void;
  shellMenuPositionStorageKey: string;
  openSecondaryOperatorWindow: () => void;
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
  | "setShellMenuPosition"
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
    setShellMenuPosition(position: string): void {
      state.shellMenuPosition = position === "top" ? "top" : "left";
      window.localStorage.setItem(deps.shellMenuPositionStorageKey, state.shellMenuPosition);
      deps.render();
    },
    openSecondaryOperatorWindow(): void {
      deps.openSecondaryOperatorWindow();
    },
    toggleOperatorLayoutEditor(): void {
      state.operatorLayoutEditorOpen = !state.operatorLayoutEditorOpen;
      deps.broadcastOperatorLayoutUpdate();
      deps.render();
    },
    applyOperatorLayoutPreset(presetId: string): void {
      state.operatorLayout = createOperatorLayoutPreset(presetId === "single-screen" ? "single-screen" : "two-screen");
      persistOperatorLayoutForCurrentUser();
      deps.broadcastOperatorLayoutUpdate();
      deps.render();
    },
    moveOperatorLayoutWidget(widgetId: string, action: string): void {
      const normalizedAction = action === "down" || action === "to-primary" || action === "to-secondary" ? action : "up";
      const validWidgetId = operatorLayoutWidgetIds.find((entry) => entry === widgetId);
      if (!validWidgetId) {
        return;
      }

      state.operatorLayout = moveOperatorLayoutWidget(state.operatorLayout, validWidgetId, normalizedAction);
      persistOperatorLayoutForCurrentUser();
      deps.broadcastOperatorLayoutUpdate();
      deps.render();
    },
    repositionOperatorLayoutWidget(widgetId: string, role: string, index: number): void {
      const validWidgetId = operatorLayoutWidgetIds.find((entry) => entry === widgetId);
      if (!validWidgetId) {
        return;
      }

      const targetRole = role === "secondary" ? "secondary" : "primary";
      state.operatorLayout = repositionOperatorLayoutWidget(state.operatorLayout, validWidgetId, targetRole, index);
      persistOperatorLayoutForCurrentUser();
      deps.broadcastOperatorLayoutUpdate();
      deps.render();
    },
    updateOperatorLayoutWidgetWidth(widgetId: string, width: string): void {
      const validWidgetId = operatorLayoutWidgetIds.find((entry) => entry === widgetId);
      const validWidth = width === "wide" || width === "full" ? width : "normal";
      if (!validWidgetId) {
        return;
      }

      state.operatorLayout = updateOperatorLayoutWidgetWidth(state.operatorLayout, validWidgetId, validWidth);
      persistOperatorLayoutForCurrentUser();
      deps.broadcastOperatorLayoutUpdate();
      deps.render();
    },
    updateOperatorLayoutWidgetHeight(widgetId: string, height: string): void {
      const validWidgetId = operatorLayoutWidgetIds.find((entry) => entry === widgetId);
      const validHeight = height === "tall" ? "tall" : "normal";
      if (!validWidgetId) {
        return;
      }

      state.operatorLayout = updateOperatorLayoutWidgetHeight(state.operatorLayout, validWidgetId, validHeight);
      persistOperatorLayoutForCurrentUser();
      deps.broadcastOperatorLayoutUpdate();
      deps.render();
    },
    updateOperatorLayoutDraftName(value: string): void {
      state.operatorLayoutDraftName = value;
      deps.broadcastOperatorLayoutUpdate();
      deps.render();
    },
    saveOperatorLayoutProfile(event: SubmitEvent): void {
      event.preventDefault();
      const name = state.operatorLayoutDraftName.trim() || defaultOperatorLayoutDraftName();
      const profile = createOperatorLayoutProfile(name, state.operatorLayout);
      state.operatorLayoutProfiles = [...state.operatorLayoutProfiles, profile];
      state.operatorLayoutDraftName = "";
      persistOperatorLayoutForCurrentUser();
      deps.broadcastOperatorLayoutUpdate();
      deps.render();
    },
    applyOperatorLayoutProfile(profileId: string): void {
      const profile = state.operatorLayoutProfiles.find((entry) => entry.id === profileId);
      if (!profile) {
        return;
      }

      state.operatorLayout = profile.layout;
      persistOperatorLayoutForCurrentUser();
      deps.broadcastOperatorLayoutUpdate();
      deps.render();
    },
    deleteOperatorLayoutProfile(profileId: string): void {
      state.operatorLayoutProfiles = state.operatorLayoutProfiles.filter((entry) => entry.id !== profileId);
      persistOperatorLayoutForCurrentUser();
      deps.broadcastOperatorLayoutUpdate();
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

  function persistOperatorLayoutForCurrentUser(): void {
    const userId = state.session?.user.id;
    if (!userId) {
      return;
    }

    savePersistedOperatorLayoutBundle(userId, {
      layout: state.operatorLayout,
      profiles: state.operatorLayoutProfiles
    });
  }
}
