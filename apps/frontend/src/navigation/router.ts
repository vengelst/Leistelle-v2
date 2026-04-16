/**
 * Kleiner Hash-basierter Workspace-Router des Frontends.
 *
 * Der Router synchronisiert URL-Hash und globalen UI-Zustand fuer die grossen
 * Arbeitsbereiche der Anwendung, ohne ein externes Routing-Framework
 * einzufuehren.
 */
import type { UiShellDescriptor } from "@leitstelle/contracts";
import type { LeitstelleMode, WorkspaceId } from "../state.js";

import {
  defaultWorkspaceNavigation,
  hrefForLeitstelleMode,
  hrefForWorkspace,
  resolveWorkspaceNavigation,
  serializeWorkspaceNavigation,
  workspaceIds,
  workspaceNavigationForRegion,
  type WorkspaceNavigation
} from "./routes.js";
import { state } from "../state.js";

export type WorkspaceRouter = {
  readonly workspaceIds: WorkspaceId[];
  initializeFromHash: () => void;
  start: () => () => void;
  resolveNavigationFromHash: (hash: string) => WorkspaceNavigation;
  syncWorkspaceHash: (workspaceId: WorkspaceId, leitstelleMode?: LeitstelleMode) => void;
  navigateTo: (navigation: WorkspaceNavigation) => void;
  navigateWorkspace: (workspaceId: string) => void;
  navigateLeitstelleMode: (mode: string) => void;
  navigateToRegion: (regionId: UiShellDescriptor["regions"][number]["id"]) => void;
  hrefForWorkspace: (workspaceId: WorkspaceId) => string;
  hrefForLeitstelleMode: (mode: LeitstelleMode) => string;
};

type WorkspaceRouterDeps = {
  onNavigationChange: () => void;
};

export function createWorkspaceRouter(deps: WorkspaceRouterDeps): WorkspaceRouter {
  function resolveNavigationFromHash(hash: string): WorkspaceNavigation {
    return resolveWorkspaceNavigation(hash);
  }

  function syncWorkspaceHash(workspaceId: WorkspaceId, leitstelleMode?: LeitstelleMode): void {
    const nextHash = workspaceId === "leitstelle"
      ? serializeWorkspaceNavigation({ workspace: workspaceId, leitstelleMode: leitstelleMode ?? "alarms" })
      : serializeWorkspaceNavigation({ workspace: workspaceId });
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }

  function applyNavigation(navigation: WorkspaceNavigation): boolean {
    // Nur die globalen Navigationsachsen werden hier angepasst; Detailzustand bleibt anderswo.
    const nextLeitstelleMode = navigation.workspace === "leitstelle"
      ? navigation.leitstelleMode ?? "alarms"
      : state.leitstelleMode;
    let changed = false;

    if (navigation.workspace !== state.activeWorkspace) {
      state.activeWorkspace = navigation.workspace;
      changed = true;
    }

    if (navigation.workspace === "leitstelle" && nextLeitstelleMode !== state.leitstelleMode) {
      state.leitstelleMode = nextLeitstelleMode;
      changed = true;
    }

    return changed;
  }

  function navigateTo(navigation: WorkspaceNavigation): void {
    applyNavigation(navigation);
    syncWorkspaceHash(
      navigation.workspace,
      navigation.workspace === "leitstelle" ? navigation.leitstelleMode : undefined
    );
  }

  function syncHashToNavigation(hash: string): WorkspaceNavigation {
    const navigation = resolveNavigationFromHash(hash);
    const canonicalHash = serializeWorkspaceNavigation(navigation);
    if (window.location.hash !== canonicalHash) {
      window.history.replaceState(null, "", canonicalHash);
    }
    return navigation;
  }

  function initializeFromHash(): void {
    const initialNavigation = syncHashToNavigation(window.location.hash);
    if (!applyNavigation(initialNavigation) && !window.location.hash) {
      syncWorkspaceHash(defaultWorkspaceNavigation.workspace, defaultWorkspaceNavigation.leitstelleMode);
    }
  }

  function start(): () => void {
    const listener = () => {
      const navigationFromHash = syncHashToNavigation(window.location.hash);
      if (applyNavigation(navigationFromHash)) {
        deps.onNavigationChange();
      }
    };

    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }

  function navigateWorkspace(workspaceId: string): void {
    const nextWorkspace = workspaceIds.includes(workspaceId as WorkspaceId)
      ? (workspaceId as WorkspaceId)
      : defaultWorkspaceNavigation.workspace;
    navigateTo(nextWorkspace === "leitstelle" ? { workspace: nextWorkspace, leitstelleMode: "alarms" } : { workspace: nextWorkspace });
  }

  function navigateLeitstelleMode(mode: string): void {
    navigateTo(resolveWorkspaceNavigation(`#leitstelle/${mode}`));
  }

  function navigateToRegion(regionId: UiShellDescriptor["regions"][number]["id"]): void {
    navigateTo(workspaceNavigationForRegion(regionId));
  }

  return {
    workspaceIds,
    initializeFromHash,
    start,
    resolveNavigationFromHash,
    syncWorkspaceHash,
    navigateTo,
    navigateWorkspace,
    navigateLeitstelleMode,
    navigateToRegion,
    hrefForWorkspace,
    hrefForLeitstelleMode
  };
}
