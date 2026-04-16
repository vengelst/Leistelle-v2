/**
 * Root-View des Frontends.
 *
 * Hier wird entschieden, ob Login, Haupt-App oder das sekundäre Operatorfenster
 * gerendert wird. Die Datei setzt damit die globale Shell um, nicht die
 * Detaillogik einzelner Fachbereiche.
 */
import type { WorkspaceId } from "../state.js";

import { hrefForLeitstelleMode } from "../navigation/routes.js";
import { state } from "../state.js";
import { shell } from "../shared/shell.js";
import { formatUserStatusLabel, renderNotice, renderPill, renderSectionHeader, renderUserStatusBar } from "./common.js";
import { canAccessSettingsWorkspace, renderStandaloneLoginScreen } from "./auth.js";
import { renderDashboardSection } from "./dashboard.js";
import { renderReportingSection, renderArchiveSection } from "./reporting.js";
import { renderMapSection } from "./map.js";
import { renderSettingsSection, renderSiteManagementSection } from "./master-data.js";
import { renderOperatorWorkspace } from "./operator.js";

type WorkspaceDescriptor = {
  id: WorkspaceId;
  title: string;
  description: string;
  regions: Array<(typeof shell.regions)[number]["id"]>;
};

const workspaces: WorkspaceDescriptor[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Kompakte operative Uebersicht und direkter Einstieg in die aktuelle Lage.",
    regions: ["dashboard"]
  },
  {
    id: "leitstelle",
    title: "Leitstelle",
    description: "Operativer Arbeitsbereich fuer Alarm- und Stoerungsbearbeitung.",
    regions: ["pipeline", "monitoring"]
  },
  {
    id: "map",
    title: "Karte",
    description: "DACH-Uebersicht mit Standortstatus und operativen Sprungpunkten.",
    regions: ["map"]
  },
  {
    id: "sites",
    title: "Standorte",
    description: "Standortstammdaten, Technikverwaltung, Netzwerk, Audio und Alarmquellen in einem eigenen Produktbereich pflegen.",
    regions: ["master-data"]
  },
  {
    id: "archive-reporting",
    title: "Archiv / Reporting",
    description: "Archivsicht und Auswertung in einem gemeinsamen Analysebereich.",
    regions: ["archive", "reporting"]
  },
  {
    id: "settings",
    title: "Einstellungen",
    description: "Globale Einstellungen, Zugang, Benutzer und Rollen an einem administrativen Einstieg buendeln.",
    regions: ["master-data", "authentication"]
  }
];

export function renderApp(): string {
  if (!state.session) {
    return renderStandaloneLoginScreen();
  }

  // Das zweite Operatorfenster ist eine eigene, reduzierte Root-Ansicht.
  if (state.operatorWindowRole === "secondary") {
    return renderSecondaryOperatorWindow();
  }

  const visibleWorkspaces = workspaces.filter((workspace) => workspace.id !== "settings" || canAccessSettingsWorkspace());
  const activeWorkspace = visibleWorkspaces.find((workspace) => workspace.id === state.activeWorkspace) ?? visibleWorkspaces[0]!;
  const pendingOperations = Object.values(state.pendingOperations);
  const isLeitstelle = activeWorkspace.id === "leitstelle";
  const isWallboard = isLeitstelle && state.leitstelleMode === "wallboard";
  const isLeitstelleNavigationCollapsed = isLeitstelle && state.leitstelleNavigationCollapsed;
  const isKiosk = state.kioskMode;
  const isTopNavigation = state.shellMenuPosition === "top";

  return `
    <main class="shell shell-with-navigation${isLeitstelle ? " leitstelle-shell" : ""}${isWallboard ? " wallboard-shell" : ""}${isKiosk ? " kiosk-shell" : ""}${isTopNavigation ? " shell-nav-top" : ""}">
      <header class="hero${isLeitstelle ? " leitstelle-hero" : ""}${isKiosk ? " kiosk-hero" : ""}">
        <div class="hero-topline">
          <div>
            <p class="eyebrow">${shell.subtitle}</p>
            <h1>${shell.title}</h1>
          </div>
          <div class="hero-status">
            ${renderPill(`Bereich ${activeWorkspace.title}`)}
            ${renderPill(state.session.user.displayName)}
            ${renderPill(`Status ${formatUserStatusLabel(state.session.user.status)}`)}
            ${state.kioskMode ? renderPill("Kiosk aktiv") : ""}
            ${pendingOperations.length > 0 ? renderPill(`Laedt ${pendingOperations.length}`) : ""}
            <button type="button" id="kiosk-toggle-button" class="secondary theme-toggle-button">${state.kioskMode ? "Kiosk verlassen" : "Kiosk aktivieren"}</button>
            <button
              type="button"
              id="theme-toggle-button"
              class="secondary theme-toggle-button icon-only-button"
              aria-label="${state.themeMode === "dark" ? "Auf helles Theme umschalten" : "Auf dunkles Theme umschalten"}"
              title="${state.themeMode === "dark" ? "Hell" : "Dunkel"}"
            >${state.themeMode === "dark" ? "☀" : "☾"}</button>
          </div>
        </div>
        ${renderUserStatusBar(state.session.user)}
        ${pendingOperations.length > 0
          ? `<div class="notice inline-notice app-loading-notice">Aktive Vorgaenge: ${pendingOperations.join(" | ")}</div>`
          : ""}
      </header>
      <section class="workspace-shell${isLeitstelle ? " leitstelle-workspace-shell" : ""}${isLeitstelleNavigationCollapsed ? " leitstelle-nav-collapsed" : ""}${isKiosk ? " kiosk-workspace-shell" : ""}${isTopNavigation ? " workspace-shell-topnav" : ""}">
        ${isLeitstelleNavigationCollapsed && !isKiosk ? "" : renderWorkspaceNavigation(activeWorkspace, visibleWorkspaces, state.shellMenuPosition)}
        <section class="workspace-main${isLeitstelle ? " leitstelle-workspace-main" : ""}">
          ${isLeitstelle ? renderLeitstelleToolbar() : `
            <article class="workspace-summary card">
              <p class="eyebrow">Aktiver Bereich</p>
              ${renderSectionHeader(activeWorkspace.title, {
                level: "h2",
                subtitle: activeWorkspace.description
              })}
            </article>
          `}
          <section class="workspace-grid">
            ${renderWorkspaceContent(activeWorkspace)}
          </section>
        </section>
      </section>
      ${state.message ? renderNotice(state.message, "success") : ""}
      ${state.error ? renderNotice(state.error, "error") : ""}
    </main>
  `;
}

function renderWorkspaceContent(activeWorkspace: WorkspaceDescriptor): string {
  if (activeWorkspace.id === "leitstelle") {
    return `
      <article id="region-pipeline" class="workspace-card wide leitstelle-focus-card">
        ${renderOperatorWorkspace()}
      </article>
    `;
  }

  if (activeWorkspace.id === "sites") {
    return `
      <article id="region-master-data" class="card workspace-card wide">
        <h2>Standorte</h2>
        <p>Standortdaten, Technik, Netzwerk, Audio und vorbereitete Alarmquellen-Zuordnung sind hier getrennt vom operativen Leitstellenbereich gebuendelt.</p>
        ${renderSiteManagementSection()}
      </article>
    `;
  }

  if (activeWorkspace.id === "settings") {
    return `
      <article id="region-settings" class="card workspace-card wide">
        <h2>Einstellungen</h2>
        ${renderSettingsSection()}
      </article>
    `;
  }

  return activeWorkspace.regions.map((regionId) => renderRegion(regionId)).join("");
}

function renderWorkspaceNavigation(
  activeWorkspace: WorkspaceDescriptor,
  visibleWorkspaces: WorkspaceDescriptor[],
  menuPosition: "left" | "top"
): string {
  return `
    <aside class="workspace-nav-card${menuPosition === "top" ? " workspace-nav-card-top" : ""}">
      <div class="workspace-nav-header">
        <p class="eyebrow">Produktbereiche</p>
        <h2>Hauptnavigation</h2>
        <p class="muted">Die Primaernavigation ordnet die vorhandenen Funktionen in klare Arbeitsbereiche statt in eine flache Gesamtsicht.</p>
      </div>
      <nav class="workspace-nav${menuPosition === "top" ? " workspace-nav-top" : ""}" aria-label="Primaernavigation">
        ${visibleWorkspaces.map((workspace) => `
          <div class="workspace-nav-entry">
            <button
              type="button"
              class="workspace-nav-button${workspace.id === activeWorkspace.id ? " is-active" : ""}"
              data-workspace-id="${workspace.id}"
            >
              <strong>${workspace.title}</strong>
              <span>${workspace.description}</span>
            </button>
            ${workspace.id === "leitstelle"
              ? `
                <div class="workspace-nav-subroutes">
                  <a class="button-link secondary workspace-nav-subroute" href="${hrefForLeitstelleMode("overview")}">Arbeitsplatz</a>
                  <a class="button-link secondary workspace-nav-subroute" href="${hrefForLeitstelleMode("alarms")}">Alarm-Pipeline</a>
                  <a class="button-link secondary workspace-nav-subroute" href="${hrefForLeitstelleMode("disturbances")}">Stoerungspipeline</a>
                  <a class="button-link secondary workspace-nav-subroute" href="${hrefForLeitstelleMode("operator")}">Alarmannahme-Screen</a>
                  <a class="button-link secondary workspace-nav-subroute" href="${hrefForLeitstelleMode("wallboard")}">Wallboard</a>
                </div>
              `
              : ""}
          </div>
        `).join("")}
      </nav>
    </aside>
  `;
}

function renderLeitstelleToolbar(): string {
  const soundStatusLabel = state.alarmSoundEnabled ? "Alarmton an" : "Alarmton aus";
  const soundPriorityLabel = state.alarmSoundIncludeNormalPriority ? "ab normal" : "kritisch/hoch";
  const soundPermissionLabel = formatAlarmSoundPermissionLabel();
  const isOperatorMode = state.leitstelleMode === "operator";

  return `
    <section class="workspace-main-toolbar leitstelle-toolbar">
      <div class="workspace-main-toolbar-copy">
        <p class="eyebrow">Leitstellenmodus</p>
        <h2>Operativer Arbeitsbereich</h2>
        <p class="muted">Pipeline und Detailansicht stehen im Vordergrund; die Hauptnavigation kann bei Bedarf ausgeblendet werden.</p>
      </div>
      <div class="workspace-main-toolbar-actions">
        ${renderPill(soundStatusLabel)}
        ${renderPill(`Signal ${soundPriorityLabel}`)}
        ${state.alarmSoundEnabled ? renderPill(`Audio ${soundPermissionLabel}`) : ""}
        ${isOperatorMode ? renderPill("2-Screen bereit") : ""}
        <button type="button" id="leitstelle-nav-toggle-button" class="secondary">
          ${state.leitstelleNavigationCollapsed ? "Navigation einblenden" : "Navigation einklappen"}
        </button>
        ${isOperatorMode ? `<button type="button" id="open-secondary-operator-window-button" class="secondary">2. Bildschirm oeffnen</button>` : ""}
        <button type="button" id="alarm-sound-toggle-button" class="secondary">
          ${state.alarmSoundEnabled ? "Alarmton stummschalten" : "Alarmton aktivieren"}
        </button>
        <button type="button" id="alarm-sound-normal-toggle-button" class="secondary">
          ${state.alarmSoundIncludeNormalPriority ? "Normale Alarme stummschalten" : "Normale Alarme mitmelden"}
        </button>
        <button type="button" id="alarm-sound-test-button" class="secondary">
          ${state.alarmSoundPermissionState === "blocked" ? "Audio freigeben / Testton" : "Testton"}
        </button>
        <div class="workspace-subnav leitstelle-toolbar-nav">
          <a class="button-link secondary" href="${hrefForLeitstelleMode("overview")}">Arbeitsplatz</a>
          <a class="button-link secondary" href="${hrefForLeitstelleMode("alarms")}">Alarm-Pipeline</a>
          <a class="button-link secondary" href="${hrefForLeitstelleMode("disturbances")}">Stoerungspipeline</a>
          <a class="button-link secondary" href="${hrefForLeitstelleMode("operator")}">Alarmannahme-Screen</a>
          <a class="button-link secondary" href="${hrefForLeitstelleMode("wallboard")}">Wallboard</a>
        </div>
      </div>
      ${renderAlarmSoundNotice()}
    </section>
  `;
}

function formatAlarmSoundPermissionLabel(): string {
  switch (state.alarmSoundPermissionState) {
    case "ready":
      return "bereit";
    case "blocked":
      return "Freigabe fehlt";
    case "unsupported":
      return "nicht verfuegbar";
    case "unknown":
    default:
      return "wartet";
  }
}

function renderAlarmSoundNotice(): string {
  if (!state.alarmSoundEnabled) {
    return "";
  }

  if (state.alarmSoundPermissionState === "blocked") {
    return renderNotice("Browser-Audio ist noch nicht freigegeben. Mit dem Testton kann der Alarmton im aktuellen Tab aktiviert werden.", "default", true);
  }

  if (state.alarmSoundPermissionState === "unsupported") {
    return renderNotice("Dieser Browser stellt keine unterstuetzte Audio-API fuer den Alarmton bereit.", "error", true);
  }

  return "";
}

function renderSecondaryOperatorWindow(): string {
  return `
    <main class="shell operator-window-shell operator-window-shell-secondary">
      <header class="hero leitstelle-hero operator-window-hero">
        <div class="hero-topline">
          <div>
            <p class="eyebrow">${shell.subtitle}</p>
            <h1>Alarmmonitor</h1>
          </div>
          <div class="hero-status">
            ${renderPill("Screen 2")}
            ${renderPill(state.session!.user.displayName)}
            ${renderPill("FIFO + Medien + Karte")}
          </div>
        </div>
        <p class="muted">Dieses Fenster ist fuer Warteschlange, Medien und Vor-Ort-Karte gedacht. Standortdaten, Ablauf und Dokumentation bleiben im Hauptfenster.</p>
      </header>
      <section class="operator-window-body">
        ${renderOperatorWorkspace()}
      </section>
      ${state.message ? renderNotice(state.message, "success") : ""}
      ${state.error ? renderNotice(state.error, "error") : ""}
    </main>
  `;
}

function renderRegion(regionId: (typeof shell.regions)[number]["id"]): string {
  const region = shell.regions.find((entry) => entry.id === regionId);
  if (!region) {
    return "";
  }

  return `
    <article id="region-${region.id}" class="card workspace-card ${region.id === "dashboard" ? "" : "wide"}">
      <h2>${region.title}</h2>
      <p>${region.description}</p>
      ${renderRegionContent(region.id)}
    </article>
  `;
}

function renderRegionContent(regionId: (typeof shell.regions)[number]["id"]): string {
  switch (regionId) {
    case "authentication":
      return renderSettingsSection();
    case "dashboard":
      return renderDashboardSection();
    case "reporting":
      return renderReportingSection();
    case "archive":
      return renderArchiveSection();
    case "map":
      return renderMapSection();
    case "pipeline":
    case "monitoring":
      return renderOperatorWorkspace();
    default:
      return "";
  }
}
