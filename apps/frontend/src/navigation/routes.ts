/**
 * Reine Navigationskonventionen des Frontends.
 *
 * Die Datei haelt die erlaubten Workspace- und Leitstellen-Pfade im
 * Hash-Routing zusammen und bildet Regionen auf die grossen Arbeitsbereiche ab.
 */
import type { UiShellDescriptor } from "@leitstelle/contracts";

import type { LeitstelleMode, WorkspaceId } from "../state.js";

export type WorkspaceNavigation = {
  workspace: WorkspaceId;
  leitstelleMode?: LeitstelleMode;
};

export const defaultWorkspaceNavigation: WorkspaceNavigation = {
  workspace: "dashboard"
};

export const workspaceIds: WorkspaceId[] = ["dashboard", "leitstelle", "map", "sites", "archive-reporting", "settings", "administration"];
export const leitstelleModes: LeitstelleMode[] = ["overview", "alarms", "disturbances", "operator", "intake", "wallboard"];

const workspaceByRegion: Record<UiShellDescriptor["regions"][number]["id"], WorkspaceId> = {
  authentication: "settings",
  dashboard: "dashboard",
  reporting: "archive-reporting",
  archive: "archive-reporting",
  map: "map",
  pipeline: "leitstelle",
  monitoring: "leitstelle",
  "master-data": "settings"
};

export function resolveWorkspaceNavigation(hash: string): WorkspaceNavigation {
  const normalized = hash.replace(/^#/, "").trim();
  if (!normalized) {
    return defaultWorkspaceNavigation;
  }

  const [workspacePart, modePart] = normalized.split("/");
  if (workspacePart === "administration") {
    return { workspace: "settings" };
  }
  const workspace = workspaceIds.find((workspaceId) => workspaceId === workspacePart);
  if (!workspace) {
    return defaultWorkspaceNavigation;
  }

  if (workspace === "leitstelle") {
    return {
      workspace,
      leitstelleMode: normalizeLeitstelleMode(modePart)
    };
  }

  return { workspace };
}

export function normalizeLeitstelleMode(mode?: string): LeitstelleMode {
  return leitstelleModes.find((entry) => entry === mode) ?? "alarms";
}

export function serializeWorkspaceNavigation(navigation: WorkspaceNavigation): string {
  return navigation.workspace === "leitstelle"
    ? `#leitstelle/${normalizeLeitstelleMode(navigation.leitstelleMode)}`
    : `#${navigation.workspace}`;
}

export function hrefForWorkspace(workspace: WorkspaceId): string {
  return serializeWorkspaceNavigation({ workspace });
}

export function hrefForLeitstelleMode(mode: LeitstelleMode): string {
  return serializeWorkspaceNavigation({ workspace: "leitstelle", leitstelleMode: mode });
}

export function workspaceNavigationForRegion(regionId: UiShellDescriptor["regions"][number]["id"]): WorkspaceNavigation {
  const workspace = workspaceByRegion[regionId] ?? defaultWorkspaceNavigation.workspace;
  return workspace === "leitstelle"
    ? { workspace, leitstelleMode: "alarms" }
    : { workspace };
}
