/**
 * Views fuer Stammdaten, Standortverwaltung und Einstellungen.
 *
 * Diese Datei deckt einen grossen Verwaltungsbereich ab: Standortlisten,
 * Detailpflege, Technik, Plaene, Alarmquellen und administrative Einstellungen.
 */
import type { DeviceType, MasterDataOverview, SiteDevice } from "@leitstelle/contracts";

import { state, deviceTypeOptions, planKindOptions, siteStatusOptions, userAdministrationRoleOptions, type SettingsSection } from "../state.js";
import { escapeHtml, formatTimestamp } from "../utils.js";
import {
  formatUserRoleLabel,
  renderCustomerOptions,
  renderEmptyState,
  renderInstructionProfile,
  renderNotice,
  renderOptions,
  renderPill,
  renderSectionHeader,
  renderSiteOptions,
  renderSitePlanWorkspace
} from "./common.js";
import { canAccessSettingsWorkspace, renderSettingsAccessSection, renderSettingsUserSection } from "./auth.js";

type SiteManagementSectionDescriptor = {
  id: "overview" | "master-data" | "technology" | "network" | "audio" | "alarm-sources" | "history";
  label: string;
};

type SettingsSectionDescriptor = {
  id: SettingsSection;
  label: string;
  description: string;
};

const mediaBundleProfileKeys = [
  "three_images_one_clip",
  "single_snapshot",
  "clip_only",
  "nvr_channel_snapshot_clip",
  "event_without_media"
] as const;

type MediaBundleProfileKey = (typeof mediaBundleProfileKeys)[number];

const siteManagementSections: SiteManagementSectionDescriptor[] = [
  { id: "overview", label: "Uebersicht" },
  { id: "master-data", label: "Stammdaten" },
  { id: "technology", label: "Technik" },
  { id: "network", label: "Netzwerk" },
  { id: "audio", label: "Audio" },
  { id: "alarm-sources", label: "Alarmquellen" },
  { id: "history", label: "Historie" }
];

const settingsSections: SettingsSectionDescriptor[] = [
  {
    id: "overview",
    label: "Uebersicht",
    description: ""
  },
  {
    id: "general",
    label: "Allgemein",
    description: ""
  },
  {
    id: "users",
    label: "Benutzer",
    description: ""
  },
  {
    id: "roles",
    label: "Admin / Rollen & Rechte",
    description: ""
  }
];

const mediaBundleProfileLabels: Record<MediaBundleProfileKey, string> = {
  three_images_one_clip: "3 Bilder + 1 Clip",
  single_snapshot: "Einzel-Snapshot",
  clip_only: "Nur Clip",
  nvr_channel_snapshot_clip: "NVR-Kanal Snapshot + Clip",
  event_without_media: "Ereignis ohne Medien"
};

export function renderMasterDataSection(): string {
  return renderSiteManagementSection();
}

export function renderSiteManagementSection(): string {
  return renderSiteManagementContent(false);
}

function renderSiteManagementContent(embeddedInSettings: boolean): string {
  if (!state.session) {
    return renderEmptyState("Nach dem Login koennen Standorte, Technik und Plaene im administrativen Stammdatenbereich gepflegt werden.");
  }

  const overview = state.overview;
  const canEdit = state.session.user.roles.includes("administrator") || state.session.user.roles.includes("leitstellenleiter");

  if (!overview) {
    return `
      <section class="stack">
        <article class="subcard stack compact">
          ${renderSectionHeader("Standorte", {
            subtitle: embeddedInSettings
              ? "Die vorhandene Standortverwaltung wird hier unter Einstellungen weiterverwendet. Operative Alarmarbeit bleibt weiterhin im Leitstellenbereich getrennt."
              : "Der Bereich bleibt bewusst getrennt von Alarm-Hauptscreen, Operator-Screen und Wallboard. Hier werden nur Standort- und Technikstammdaten gepflegt.",
            actions: `<button type="button" id="refresh-overview-button" class="secondary">Standortdaten laden</button>`
          })}
          ${renderEmptyState("Noch keine Standortdaten geladen.")}
        </article>
      </section>
    `;
  }

  const filteredSites = getFilteredSites(overview);
  const selectedSite = resolveSelectedSite(overview, filteredSites);

  return `
    <section class="stack">
      <article class="subcard stack compact">
        ${renderSectionHeader("Standorte", {
          subtitle: embeddedInSettings
            ? "Standortstammdaten, Technik, Netzwerk, Audio und Alarmquellen werden hier als vorhandener administrativer Bereich unter Einstellungen gefuehrt."
            : "Administrativer Pflegebereich fuer Standortstammdaten, Technik, Netzwerk, Audio und vorbereitete Alarmquellen-Zuordnung. Operative Alarmarbeit bleibt weiterhin im Leitstellenbereich.",
          actions: `
            <button type="button" id="refresh-overview-button" class="secondary">Standortdaten aktualisieren</button>
            ${canEdit ? `<button type="button" id="site-management-create-site-button">Standort anlegen</button>` : ""}
          `
        })}
        <div class="site-management-toolbar">
          <label class="field">
            <span>Suche</span>
            <input id="site-management-search-input" type="search" value="${escapeHtml(state.siteManagementSearch)}" placeholder="Standort, Kunde, Ort oder Referenz suchen" />
          </label>
          <label class="field">
            <span>Status</span>
            <select id="site-management-status-filter">${renderSiteStatusFilterOptions()}</select>
          </label>
          ${canEdit ? `
            <div class="field">
              <span>Archivsicht</span>
              <label class="checkbox">
                <input
                  id="site-management-show-archived-toggle"
                  type="checkbox"
                  ${state.siteManagementShowArchived ? "checked" : ""}
                />
                <span>Archivierte Standorte bewusst einblenden</span>
              </label>
            </div>
          ` : ""}
          <article class="site-management-summary-card">
            <strong>${filteredSites.length}</strong>
            <span>${state.siteManagementShowArchived ? "Standorte sichtbar" : "Aktive Standorte sichtbar"}</span>
          </article>
          <article class="site-management-summary-card">
            <strong>${filteredSites.reduce((sum, site) => sum + site.devices.length, 0)}</strong>
            <span>Technikobjekte sichtbar</span>
          </article>
        </div>
      </article>
      ${state.siteManagementView === "detail" && selectedSite
        ? renderSelectedSiteDetail(selectedSite, overview, canEdit)
        : renderSiteList(filteredSites, canEdit, overview)}
      ${state.siteManagementView === "detail" && selectedSite
        ? renderDeviceModal(selectedSite, overview, canEdit)
        : ""}
    </section>
  `;
}

export function renderSettingsSection(): string {
  if (!state.session) return renderEmptyState("Nach dem Login stehen globale Einstellungen und Einsatzanweisungen bereit.");
  const overview = state.overview;
  if (!canAccessSettingsWorkspace()) {
    return renderNotice("Der Bereich Einstellungen ist auf Administration und Leitstellenleitung beschraenkt.");
  }

  const canEditSettings = canAccessSettingsWorkspace();
  const selectedSection = state.selectedSettingsSection;
  return `
    <section class="stack">
      <article class="subcard stack compact">
        ${renderSectionHeader("Einstellungsbereiche", {
          subtitle: ""
        })}
        <div class="site-management-section-nav settings-section-nav">
          ${settingsSections.map((section) => `
            <button
              type="button"
              class="secondary settings-section-button${selectedSection === section.id ? " is-active" : ""}"
              data-settings-section="${section.id}"
            >${section.label}</button>
          `).join("")}
        </div>
      </article>
      ${renderSelectedSettingsSection(overview, canEditSettings, selectedSection)}
    </section>
  `;
}

function renderSiteList(sites: MasterDataOverview["sites"], canEdit: boolean, overview: MasterDataOverview): string {
  return `
    <section class="stack">
      <article class="subcard stack compact">
      ${renderSectionHeader("Standortliste", {
        subtitle: "Die Liste bleibt kompakt und oeffnet Standorte erst im Drill-down. Keine inline aufgeklappten Verwaltungswuesten in der Hauptliste."
      })}
      ${sites.length > 0
        ? `
          <div class="site-management-table-wrap">
            <table class="site-management-table">
              <thead>
                <tr>
                  <th>Standortname</th>
                  <th>Kunde / Organisation</th>
                  <th>Ort / Adresse</th>
                  <th>aktueller Status</th>
                  <th>Online / Offline / Warnung</th>
                  <th>alles ok?</th>
                  <th>Anzahl Komponenten</th>
                  <th>letzter Status</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                ${sites.map((site) => `
                  <tr>
                    <td><button type="button" class="button-link site-management-site-select-button site-management-site-select-button-inline" data-site-id="${site.id}">${escapeHtml(site.siteName)}</button></td>
                    <td>${escapeHtml(site.customer.name)}</td>
                    <td>${escapeHtml(formatAddress(site))}</td>
                    <td>${renderPill(formatSiteLifecycleLabel(site.status), `site-state-${site.status}`)} ${site.isArchived ? renderSiteArchivePill() : ""}</td>
                    <td>${renderPill(getSiteOperationalStatusLabel(site), `site-operational-${getSiteOperationalStatusTone(site)}`)}</td>
                    <td>${renderPill(isSiteHealthy(site) ? "ja" : "nein", isSiteHealthy(site) ? "site-health-ok" : "site-health-issue")}</td>
                    <td>${site.devices.length}</td>
                    <td>${formatTimestamp(site.technicalStatus.updatedAt)}</td>
                    <td><button type="button" class="secondary site-management-site-select-button site-management-site-select-button-inline" data-site-id="${site.id}">Oeffnen</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `
        : renderEmptyState("Noch keine Standorte passend zum Filter vorhanden.")}
      </article>
      ${canEdit && state.siteManagementCreateSiteMode ? `
        <article class="subcard stack">
          ${renderSectionHeader("Standort anlegen", {
            subtitle: "Neue Standorte werden im Verwaltungsbereich erfasst und nicht im operativen Alarmbild gepflegt."
          })}
          ${renderSiteEditorForm(undefined, overview, null)}
        </article>
      ` : ""}
    </section>
  `;
}

function renderSelectedSiteDetail(selectedSite: MasterDataOverview["sites"][number], overview: MasterDataOverview, canEdit: boolean): string {
  const selectedSection = state.selectedSiteManagementSection;
  return `
    <article class="subcard stack">
      ${renderSectionHeader(selectedSite.siteName, {
        subtitle: `${selectedSite.customer.name} | ${selectedSite.address.city}, ${selectedSite.address.country}`,
        pills: [
          renderPill(selectedSite.status),
          ...(selectedSite.isArchived ? [renderSiteArchivePill()] : []),
          renderPill(getSiteOperationalStatusLabel(selectedSite), `site-operational-${getSiteOperationalStatusTone(selectedSite)}`),
          renderPill(`${selectedSite.devices.length} Technikobjekte`),
          renderPill(`${selectedSite.plans.length} Plaene`),
          ...(state.selectedMapSiteId === selectedSite.id ? [renderPill("im Standortkontext")] : [])
        ],
        actions: `
          <button type="button" id="site-management-back-button" class="secondary">Zur Liste</button>
          ${canEdit ? `<button type="button" class="secondary site-management-edit-site-button" data-site-id="${selectedSite.id}">Bearbeiten</button>` : ""}
          ${canEdit ? renderSiteArchiveToggleButton(selectedSite) : ""}
        `
      })}
      <div class="site-management-section-nav">
        ${siteManagementSections.map((section) => `
          <button
            type="button"
            class="secondary site-management-section-button${selectedSection === section.id ? " is-active" : ""}"
            data-site-section="${section.id}"
          >${section.label}</button>
        `).join("")}
      </div>
      ${renderSelectedSiteSection(selectedSite, overview, canEdit)}
    </article>
  `;
}

function renderSelectedSiteSection(
  selectedSite: MasterDataOverview["sites"][number],
  overview: MasterDataOverview,
  canEdit: boolean
): string {
  switch (state.selectedSiteManagementSection) {
    case "master-data":
      return renderMasterDataSectionContent(selectedSite, overview, canEdit);
    case "technology":
      return renderTechnologySection(selectedSite, overview, canEdit);
    case "network":
      return renderNetworkSection(selectedSite, overview, canEdit);
    case "audio":
      return renderAudioSection(selectedSite, overview, canEdit);
    case "alarm-sources":
      return renderAlarmSourcesSection(selectedSite, overview, canEdit);
    case "history":
      return renderHistorySection(selectedSite);
    case "overview":
    default:
      return renderOverviewSection(selectedSite, overview, canEdit);
  }
}

function renderOverviewSection(
  selectedSite: MasterDataOverview["sites"][number],
  overview: MasterDataOverview,
  canEdit: boolean
): string {
  return `
    <section class="stack">
      <article class="subcard stack compact">
        ${renderSectionHeader("Stammdaten", {
          subtitle: "Die Uebersicht bleibt lesend. Bearbeiten oeffnet den bestehenden Stammdaten-Editor im gleichnamigen Tab.",
          actions: canEdit ? `<button type="button" class="secondary site-management-edit-site-button" data-site-id="${selectedSite.id}">Stammdaten bearbeiten</button>` : ""
        })}
        <div class="site-management-table-wrap">
          <table class="site-management-detail-table">
            <tbody>
              <tr><th>Standortname</th><td>${escapeHtml(selectedSite.siteName)}</td><th>Kunde</th><td>${escapeHtml(selectedSite.customer.name)}</td></tr>
              <tr><th>Referenz</th><td>${escapeHtml(selectedSite.internalReference ?? "-")}</td><th>Status</th><td>${escapeHtml(selectedSite.status)}</td></tr>
              <tr><th>Archivstatus</th><td>${selectedSite.isArchived ? renderSiteArchivePill() : "aktiv"}</td><th>Koordinaten</th><td>${selectedSite.coordinates ? `${selectedSite.coordinates.latitude.toFixed(5)}, ${selectedSite.coordinates.longitude.toFixed(5)}` : "-"}</td></tr>
              <tr><th>Adresse</th><td>${escapeHtml(formatAddress(selectedSite))}</td><th>Alarm-/Techniklage</th><td>${renderPill(getSiteOperationalStatusLabel(selectedSite), `site-operational-${getSiteOperationalStatusTone(selectedSite)}`)}</td></tr>
              <tr><th>Ansprechpartner</th><td>${escapeHtml(selectedSite.contactPerson ?? "-")}</td><th>Telefon</th><td>${escapeHtml(selectedSite.contactPhone ?? "-")}</td></tr>
              <tr><th>Standorttyp</th><td>${escapeHtml(selectedSite.siteType ?? "-")}</td><th>Bemerkungen</th><td>${escapeHtml(selectedSite.notes ?? selectedSite.description ?? "-")}</td></tr>
            </tbody>
          </table>
        </div>
      </article>
      ${canEdit
        ? `
          <article class="subcard stack compact site-management-overview-action-card">
            <strong>Bearbeitung startet im Stammdaten-Tab</strong>
            <p class="muted">Nach Klick auf Bearbeiten wird direkt in den zentralen Stammdaten-Editor gewechselt. Dort kann der Standort ohne zweiten Pflegepfad aktualisiert werden.</p>
            <div class="actions">
              <button type="button" class="site-management-edit-site-button" data-site-id="${selectedSite.id}">Editor oeffnen</button>
            </div>
          </article>
        `
        : ""}
      <article class="subcard stack compact">
        <h4>Standortzusammenfassung</h4>
        <div class="site-management-kpi-grid">
          <div class="site-management-kpi"><strong>${selectedSite.devices.length}</strong><span>Geraete gesamt</span></div>
          <div class="site-management-kpi"><strong>${selectedSite.devices.filter((device) => isCameraType(device.type)).length}</strong><span>Kameras</span></div>
          <div class="site-management-kpi"><strong>${selectedSite.devices.filter((device) => device.type === "nvr").length}</strong><span>NVR</span></div>
          <div class="site-management-kpi"><strong>${selectedSite.devices.filter((device) => device.type === "router").length}</strong><span>Router</span></div>
          <div class="site-management-kpi"><strong>${selectedSite.devices.filter((device) => device.type === "speaker").length}</strong><span>Lautsprecher</span></div>
          <div class="site-management-kpi"><strong>${selectedSite.plans.length}</strong><span>Plaene</span></div>
        </div>
      </article>
      <article class="subcard stack compact">
        <h4>Objekt-/Kameraplan</h4>
        ${selectedSite.plans.length > 0
          ? renderSitePlanWorkspace(selectedSite.id, "site")
          : renderEmptyState("Noch kein Objekt- oder Kameraplan fuer diesen Standort vorhanden.")}
      </article>
      ${canEdit
        ? renderNotice("Bearbeiten im Uebersicht-Tab oeffnet bewusst den Stammdaten-Editor und springt direkt in den bearbeitbaren Bereich.", "default", true)
        : renderNotice("Standortdetails sind sichtbar, aber Pflege bleibt auf Leitung und Administration beschraenkt.", "default", true)}
    </section>
  `;
}

function renderMasterDataSectionContent(
  selectedSite: MasterDataOverview["sites"][number],
  overview: MasterDataOverview,
  canEdit: boolean
): string {
  return `
    <section class="stack">
      <article class="subcard stack compact">
        ${renderSectionHeader("Stammdaten", {
          subtitle: "Standortdaten werden kompakt lesbar angezeigt und bei Bedarf in einen eigenen Bearbeiten-/Speichern-Flow ueberfuehrt.",
          actions: canEdit
            ? `
              ${state.selectedSiteEditorId !== selectedSite.id ? `<button type="button" class="secondary site-management-edit-site-button" data-site-id="${selectedSite.id}">Bearbeiten</button>` : ""}
              ${renderSiteArchiveToggleButton(selectedSite)}
            `
            : ""
        })}
        <div class="site-management-table-wrap">
          <table class="site-management-detail-table">
            <tbody>
              <tr><th>Standortname</th><td>${escapeHtml(selectedSite.siteName)}</td><th>Kunde</th><td>${escapeHtml(selectedSite.customer.name)}</td></tr>
              <tr><th>Referenz</th><td>${escapeHtml(selectedSite.internalReference ?? "-")}</td><th>Status</th><td>${escapeHtml(selectedSite.status)}</td></tr>
              <tr><th>Archivstatus</th><td>${selectedSite.isArchived ? renderSiteArchivePill() : "aktiv"}</td><th>Koordinaten</th><td>${selectedSite.coordinates ? `${selectedSite.coordinates.latitude.toFixed(5)}, ${selectedSite.coordinates.longitude.toFixed(5)}` : "-"}</td></tr>
              <tr><th>Adresse</th><td>${escapeHtml(formatAddress(selectedSite))}</td><th>Alarm-/Techniklage</th><td>${renderPill(getSiteOperationalStatusLabel(selectedSite), `site-operational-${getSiteOperationalStatusTone(selectedSite)}`)}</td></tr>
              <tr><th>Ansprechpartner</th><td>${escapeHtml(selectedSite.contactPerson ?? "-")}</td><th>Telefon</th><td>${escapeHtml(selectedSite.contactPhone ?? "-")}</td></tr>
              <tr><th>Standorttyp</th><td>${escapeHtml(selectedSite.siteType ?? "-")}</td><th>Bemerkungen</th><td>${escapeHtml(selectedSite.notes ?? selectedSite.description ?? "-")}</td></tr>
            </tbody>
          </table>
        </div>
      </article>
      ${canEdit && state.selectedSiteEditorId === selectedSite.id
        ? `
          <article class="subcard stack">
            ${renderSectionHeader("Standort bearbeiten", {
              subtitle: "Bearbeiten erfolgt bewusst als eigener Modus und nicht als staendig offenes Inline-Formular."
            })}
            ${renderSiteEditorForm(selectedSite, overview, selectedSite)}
          </article>
        `
        : ""}
      ${canEdit
        ? renderNotice(`Archivierung wird ueber die sichtbare Aktion gesteuert. Der Standort ist aktuell ${selectedSite.isArchived ? "archiviert" : "aktiv"}.`, "default", true)
        : ""}
    </section>
  `;
}

function renderTechnologySection(
  selectedSite: MasterDataOverview["sites"][number],
  overview: MasterDataOverview,
  canEdit: boolean
): string {
  const devices = selectedSite.devices.filter((device) => device.type === "nvr" || isCameraType(device.type));
  return `
    <section class="stack">
      <article class="subcard stack compact">
        ${renderSectionHeader("Technik", {
          subtitle: "Kameras und NVRs bleiben als eigener Technikbereich getrennt von Netzwerk- und Audioverwaltung.",
          actions: canEdit ? `<button type="button" class="secondary site-management-create-device-button">Geraet hinzufuegen</button>` : ""
        })}
        ${renderDeviceTable(selectedSite, devices, "Keine Kameras oder NVRs fuer diesen Standort vorhanden.", canEdit)}
      </article>
      ${canEdit ? renderPlanForm(selectedSite, overview) : ""}
    </section>
  `;
}

function renderNetworkSection(
  selectedSite: MasterDataOverview["sites"][number],
  overview: MasterDataOverview,
  canEdit: boolean
): string {
  const routers = selectedSite.devices.filter((device) => device.type === "router");
  return `
    <section class="stack">
      <article class="subcard stack compact">
        ${renderSectionHeader("Netzwerk", {
          subtitle: "Router- und Verbindungsbezug bleiben getrennt von der operativen Alarmbearbeitung und werden hier strukturiert gepflegt.",
          actions: canEdit ? `<button type="button" class="secondary site-management-create-device-button" data-device-type="router">Router hinzufuegen</button>` : ""
        })}
        ${renderDeviceTable(selectedSite, routers, "Noch kein Router fuer diesen Standort vorhanden.", canEdit)}
      </article>
      ${canEdit ? renderNotice("Router werden ueber die Komponentenliste im Popup bearbeitet.", "default", true) : ""}
    </section>
  `;
}

function renderAudioSection(
  selectedSite: MasterDataOverview["sites"][number],
  overview: MasterDataOverview,
  canEdit: boolean
): string {
  const speakers = selectedSite.devices.filter((device) => device.type === "speaker");
  return `
    <section class="stack">
      <article class="subcard stack compact">
        ${renderSectionHeader("Audio", {
          subtitle: "Lautsprecher und Audiozonen werden als eigener Bereich gefuehrt, damit der Hauptscreen frei von Technikformularen bleibt.",
          actions: canEdit ? `<button type="button" class="secondary site-management-create-device-button" data-device-type="speaker">Lautsprecher hinzufuegen</button>` : ""
        })}
        ${renderDeviceTable(selectedSite, speakers, "Noch kein Lautsprecher fuer diesen Standort vorhanden.", canEdit)}
      </article>
      ${canEdit ? renderNotice("Audio-Komponenten werden ueber die Komponentenliste im Popup bearbeitet.", "default", true) : ""}
    </section>
  `;
}

function renderAlarmSourcesSection(
  selectedSite: MasterDataOverview["sites"][number],
  overview: MasterDataOverview,
  canEdit: boolean
): string {
  const selectedMapping = selectedSite.alarmSourceMappings.find((mapping) => mapping.id === state.selectedAlarmSourceMappingEditorId);
  return `
    <section class="stack">
      <article class="subcard stack compact">
        ${renderSectionHeader("Alarmquellen", {
          subtitle: "Externe Alarmquellen werden hier standortbezogen auf interne Komponenten gemappt. Fuehrend bleiben die vorhandene Standort-ID und Komponenten-ID aus dem Technikmodell.",
          actions: canEdit ? `
            <button type="button" class="secondary site-management-create-device-button" data-device-type="sensor">Sensor hinzufuegen</button>
            <button type="button" class="secondary site-management-create-device-button" data-device-type="io_module">IO-Modul hinzufuegen</button>
          ` : ""
        })}
        <div class="site-management-kpi-grid">
          <div class="site-management-kpi"><strong>${selectedSite.devices.length}</strong><span>Komponenten</span></div>
          <div class="site-management-kpi"><strong>${selectedSite.alarmSourceMappings.length}</strong><span>Mapping-Regeln</span></div>
          <div class="site-management-kpi"><strong>${selectedSite.alarmSourceMappings.filter((mapping) => mapping.isActive).length}</strong><span>Aktiv</span></div>
        </div>
        ${renderNotice("Externe Kennungen werden nur fuer die Aufloesung genutzt. Karte, Alarmdetail und weitere UI-Pfade sollen intern mit derselben Komponenten-ID arbeiten.", "default", true)}
      </article>
      <article class="subcard stack compact">
        ${renderSectionHeader("Komponentenbezug", {
          subtitle: "Die vorhandene Komponentenliste bleibt die eine technische Wahrheit des Standorts. Mappings referenzieren diese Eintraege, statt eine zweite Geraetewelt anzulegen."
        })}
        ${selectedSite.devices.length > 0
          ? renderDeviceTable(selectedSite, selectedSite.devices, "Noch keine Komponenten fuer diesen Standort vorhanden.", canEdit)
          : renderEmptyState("Noch keine Komponenten fuer diesen Standort vorhanden.")}
      </article>
      <article class="subcard stack compact">
        ${renderSectionHeader("Alarmquellen-Mappings", {
          subtitle: "Jede Regel mappt eine externe Quelle deterministisch auf genau eine interne Komponente. NVR-/Parent-Bezug bleibt optional."
        })}
        ${renderAlarmSourceMappingTable(selectedSite, canEdit)}
      </article>
      ${canEdit ? `
        <article class="subcard stack">
          ${renderSectionHeader(selectedMapping ? "Alarmquellen-Mapping bearbeiten" : "Alarmquellen-Mapping anlegen", {
            subtitle: "Die Pflege bleibt bewusst im Standortkontext. Ein generisches Formular deckt Kamera-, Recorder-, Sensor- und Analytics-Pfade ab."
          })}
          ${renderAlarmSourceMappingForm(selectedSite, overview, selectedMapping)}
        </article>
      ` : renderNotice("Bearbeitung von Alarmquellen-Mappings ist auf Administration und Leitstellenleitung beschraenkt.", "default", true)}
      ${renderNotice("Matching nutzt zuerst direkte interne IDs, danach das Standort-Mapping und erst danach bestehende Serial-/IP-Fallbacks.", "default", true)}
    </section>
  `;
}

function renderAlarmSourceMappingTable(
  selectedSite: MasterDataOverview["sites"][number],
  canEdit: boolean
): string {
  if (selectedSite.alarmSourceMappings.length === 0) {
    return renderEmptyState("Noch keine Alarmquellen-Mappings fuer diesen Standort vorhanden.");
  }

  return `
    <div class="site-management-table-wrap">
      <table class="site-management-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Vendor / Source-Type</th>
            <th>Interne Komponente</th>
            <th>NVR / Parent</th>
            <th>Externe Kennungen</th>
            <th>Media-Profil</th>
            <th>Sortierung</th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          ${selectedSite.alarmSourceMappings.map((mapping) => `
            <tr>
              <td>${renderPill(mapping.isActive ? "aktiv" : "inaktiv")}</td>
              <td><strong>${escapeHtml(mapping.vendor)}</strong><br /><span class="muted">${escapeHtml(mapping.sourceType)}</span></td>
              <td>${escapeHtml(resolveSiteComponentLabel(selectedSite, mapping.componentId))}</td>
              <td>${escapeHtml(resolveSiteComponentLabel(selectedSite, mapping.nvrComponentId))}</td>
              <td>${escapeHtml(formatAlarmSourceMappingKeys(mapping))}</td>
              <td>${escapeHtml(formatMediaBundleProfileLabel(mapping.mediaBundleProfileKey))}</td>
              <td>${mapping.sortOrder}</td>
              <td>
                ${canEdit ? `<button type="button" class="secondary site-management-edit-alarm-source-mapping-button" data-mapping-id="${mapping.id}">Bearbeiten</button>` : "-"}
                ${canEdit ? `<button type="button" class="secondary site-management-toggle-alarm-source-mapping-button" data-mapping-id="${mapping.id}">${mapping.isActive ? "Deaktivieren" : "Aktivieren"}</button>` : ""}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAlarmSourceMappingForm(
  selectedSite: MasterDataOverview["sites"][number],
  overview: MasterDataOverview,
  selectedMapping: MasterDataOverview["sites"][number]["alarmSourceMappings"][number] | undefined
): string {
  return `
    <form id="alarm-source-mapping-form" class="stack" data-ui-preserve-form="true">
      <input type="hidden" name="id" value="${escapeHtml(selectedMapping?.id ?? "")}" />
      <label class="field"><span>Standort</span><select name="siteId" required>${renderSiteSelectOptionsWithSelection(overview, selectedSite.id)}</select></label>
      <div class="detail-grid">
        <label class="field"><span>Interne Komponente</span><select name="componentId" required>${renderSiteComponentOptions(selectedSite, selectedMapping?.componentId)}</select></label>
        <label class="field"><span>NVR / Parent-Komponente</span><select name="nvrComponentId">${renderNvrDeviceOptions(selectedSite, selectedMapping?.nvrComponentId)}</select></label>
        <label class="field"><span>Vendor / Source-System</span><input name="vendor" value="${escapeHtml(selectedMapping?.vendor ?? "")}" required /></label>
        <label class="field"><span>Source-Type</span><input name="sourceType" value="${escapeHtml(selectedMapping?.sourceType ?? "")}" required /></label>
        <label class="field"><span>Externer Quellschluessel / Source-Name</span><input name="externalSourceKey" value="${escapeHtml(selectedMapping?.externalSourceKey ?? "")}" /></label>
        <label class="field"><span>Externe Geraete-ID</span><input name="externalDeviceId" value="${escapeHtml(selectedMapping?.externalDeviceId ?? "")}" /></label>
        <label class="field"><span>Externe Recorder-ID</span><input name="externalRecorderId" value="${escapeHtml(selectedMapping?.externalRecorderId ?? "")}" /></label>
        <label class="field"><span>Kanal</span><input name="channelNumber" type="number" value="${selectedMapping?.channelNumber ?? ""}" /></label>
        <label class="field"><span>Seriennummer</span><input name="serialNumber" value="${escapeHtml(selectedMapping?.serialNumber ?? "")}" /></label>
        <label class="field"><span>Analytics-Name</span><input name="analyticsName" value="${escapeHtml(selectedMapping?.analyticsName ?? "")}" /></label>
        <label class="field"><span>Event-Namespace</span><input name="eventNamespace" value="${escapeHtml(selectedMapping?.eventNamespace ?? "")}" /></label>
        <label class="field"><span>Media-Bundle-Profil</span><select name="mediaBundleProfileKey">${renderMediaBundleProfileOptions(selectedMapping?.mediaBundleProfileKey)}</select></label>
        <label class="field"><span>Sortierung</span><input name="sortOrder" type="number" value="${selectedMapping?.sortOrder ?? 100}" required /></label>
        <label class="field"><span>Aktiv</span><select name="isActive">${renderOptions(["true", "false"], selectedMapping?.isActive === false ? "false" : "true")}</select></label>
      </div>
      <label class="field"><span>Beschreibung</span><textarea name="description" rows="3" placeholder="Optionaler Hinweis zur Quelle oder Matching-Regel.">${escapeHtml(selectedMapping?.description ?? "")}</textarea></label>
      <div class="actions">
        <button type="submit">${selectedMapping ? "Mapping aktualisieren" : "Mapping speichern"}</button>
        <button type="button" id="site-management-cancel-alarm-source-mapping-edit-button" class="secondary">Zuruecksetzen</button>
      </div>
    </form>
  `;
}

function renderHistorySection(selectedSite: MasterDataOverview["sites"][number]): string {
  return `
    <section class="stack">
      <article class="subcard stack compact">
        ${renderSectionHeader("Historie", {
          subtitle: "Grundstruktur fuer spaetere Aenderungs- und Technikhistorie. Aktuell wird bewusst noch keine neue Fachlogik dafuer eingefuehrt."
        })}
        <dl class="facts compact-gap">
          <div><dt>Letzter technischer Status</dt><dd>${formatTimestamp(selectedSite.technicalStatus.updatedAt)}</dd></div>
          <div><dt>Archivschutz</dt><dd>${selectedSite.isArchived ? "archiviert" : "aktiv"}</dd></div>
          <div><dt>Plaene</dt><dd>${selectedSite.plans.length}</dd></div>
          <div><dt>Technikobjekte</dt><dd>${selectedSite.devices.length}</dd></div>
        </dl>
        ${renderNotice("Eine vollstaendige Aenderungshistorie ist vorbereitet, aber noch nicht als eigener Audit-Reader im Frontend umgesetzt.", "default", true)}
      </article>
      <article class="subcard stack compact">
        <h4>Zugangsdaten-Struktur</h4>
        ${selectedSite.credentials.length > 0
          ? `<ul class="plain-list">${selectedSite.credentials.map((credential) => `
              <li>${escapeHtml(credential.label)}: ${escapeHtml(credential.usernameMasked)} / ${escapeHtml(credential.passwordMasked)} ${credential.isVisible ? "sichtbar" : "redigiert"}</li>
            `).join("")}</ul>`
          : renderEmptyState("Noch keine technischen Standortzugriffe vorhanden.")}
      </article>
    </section>
  `;
}

function renderCustomerForm(overview: MasterDataOverview): string {
  return `
    <form id="customer-form" class="subcard stack" data-ui-preserve-form="true">
      <h3>Organisation / Customer anlegen</h3>
      <label class="field"><span>Name</span><input name="name" required /></label>
      <label class="field"><span>Externe Referenz</span><input name="externalRef" /></label>
      <label class="field"><span>Aktiv</span><select name="isActive">${renderOptions(["true", "false"], "true")}</select></label>
      <p class="muted">${overview.customers.length} Customers vorhanden.</p>
      <button type="submit">Customer speichern</button>
    </form>
  `;
}

function renderSiteEditorForm(
  selectedSite: MasterDataOverview["sites"][number] | undefined,
  overview: MasterDataOverview,
  siteEditor: MasterDataOverview["sites"][number] | null
): string {
  const customerId = siteEditor?.customer.id ?? selectedSite?.customer.id ?? overview.customers[0]?.id ?? "";
  return `
    <form id="site-form" class="subcard stack" data-ui-preserve-form="true">
      <h3>${siteEditor ? "Standort bearbeiten" : "Standort anlegen"}</h3>
      <input type="hidden" name="id" value="${escapeHtml(siteEditor?.id ?? "")}" />
      <input type="hidden" name="isArchived" value="${siteEditor?.isArchived ? "true" : "false"}" />
      <label class="field"><span>Customer / Organisation</span><select name="customerId" required>${renderCustomerSelectOptions(overview, customerId)}</select></label>
      <label class="field"><span>Standortname</span><input name="siteName" value="${escapeHtml(siteEditor?.siteName ?? "")}" required /></label>
      <label class="field"><span>Interne Referenz / Objektnummer</span><input name="internalReference" value="${escapeHtml(siteEditor?.internalReference ?? "")}" /></label>
      <label class="field"><span>Status</span><select name="status">${renderOptions(siteStatusOptions, siteEditor?.status ?? "active")}</select></label>
      <label class="field"><span>Beschreibung / Notiz</span><textarea name="description" rows="3" placeholder="Kurze Beschreibung des Standorts.">${escapeHtml(siteEditor?.description ?? "")}</textarea></label>
      <div class="detail-grid">
        <label class="field"><span>Strasse</span><input name="street" value="${escapeHtml(siteEditor?.address.street ?? selectedSite?.address.street ?? "")}" required /></label>
        <label class="field"><span>Hausnummer</span><input name="houseNumber" value="${escapeHtml(siteEditor?.address.houseNumber ?? "")}" /></label>
        <label class="field"><span>PLZ</span><input name="postalCode" value="${escapeHtml(siteEditor?.address.postalCode ?? selectedSite?.address.postalCode ?? "")}" required /></label>
        <label class="field"><span>Ort</span><input name="city" value="${escapeHtml(siteEditor?.address.city ?? selectedSite?.address.city ?? "")}" required /></label>
        <label class="field"><span>Land</span><input name="country" value="${escapeHtml(siteEditor?.address.country ?? selectedSite?.address.country ?? "DE")}" required /></label>
      </div>
      <div class="detail-grid">
        <label class="field"><span>Breitengrad</span><input name="latitude" type="number" step="0.000001" value="${siteEditor?.coordinates ? escapeHtml(String(siteEditor.coordinates.latitude)) : ""}" /></label>
        <label class="field"><span>Laengengrad</span><input name="longitude" type="number" step="0.000001" value="${siteEditor?.coordinates ? escapeHtml(String(siteEditor.coordinates.longitude)) : ""}" /></label>
        <label class="field"><span>Standorttyp</span><input name="siteType" value="${escapeHtml(siteEditor?.siteType ?? "")}" /></label>
        <label class="field"><span>Ansprechpartner vor Ort</span><input name="contactPerson" value="${escapeHtml(siteEditor?.contactPerson ?? "")}" /></label>
        <label class="field"><span>Telefonnummer</span><input name="contactPhone" value="${escapeHtml(siteEditor?.contactPhone ?? "")}" /></label>
      </div>
      <label class="field"><span>Bemerkungen</span><textarea name="notes" rows="3" placeholder="Operative Hinweise oder Pflegebemerkungen.">${escapeHtml(siteEditor?.notes ?? "")}</textarea></label>
      <div class="detail-grid">
        <label class="field"><span>Monitoring-Intervall</span><input name="monitoringIntervalSeconds" type="number" value="${siteEditor?.settings.monitoringIntervalSeconds ?? 120}" required /></label>
        <label class="field"><span>Fehlerschwelle</span><input name="failureThreshold" type="number" value="${siteEditor?.settings.failureThreshold ?? 4}" required /></label>
        <label class="field"><span>Kritische Geraete hervorheben</span><select name="highlightCriticalDevices">${renderOptions(["true", "false"], siteEditor?.settings.highlightCriticalDevices === false ? "false" : "true")}</select></label>
        <label class="field"><span>Alarm-Prioritaet</span><select name="defaultAlarmPriority">${renderOptions(["normal", "high", "critical"], siteEditor?.settings.defaultAlarmPriority ?? "high")}</select></label>
        <label class="field"><span>Workflow-Profil</span><select name="defaultWorkflowProfile">${renderOptions(["default", "event_sensitive"], siteEditor?.settings.defaultWorkflowProfile ?? "event_sensitive")}</select></label>
        <label class="field"><span>Label-Modus</span><select name="mapLabelMode">${renderOptions(["short", "full"], siteEditor?.settings.mapLabelMode ?? "full")}</select></label>
      </div>
      ${siteEditor
        ? renderNotice(`Archivstatus: ${siteEditor.isArchived ? "archiviert" : "aktiv"}. Archivieren oder Reaktivieren erfolgt ueber die sichtbare Aktion im Standortdetail.`, "default", true)
        : ""}
      <div class="actions">
        <button type="submit">${siteEditor ? "Standort aktualisieren" : "Standort speichern"}</button>
        <button type="button" id="site-management-cancel-site-edit-button" class="secondary">Abbrechen</button>
      </div>
    </form>
  `;
}

function renderDeviceModal(
  selectedSite: MasterDataOverview["sites"][number],
  overview: MasterDataOverview,
  canEdit: boolean
): string {
  if (!canEdit || !state.siteManagementDeviceModalOpen) {
    return "";
  }

  const selectedDevice = selectedSite.devices.find((device) => device.id === state.selectedDeviceEditorId);
  const selectedType = state.siteManagementDeviceDraftType;
  const effectiveType = selectedDevice?.type ?? selectedType;
  const allowedTypes = selectedDevice
    ? (["camera", "nvr", "router", "speaker", "sensor", "io_module"].includes(selectedDevice.type)
      ? ["camera", "nvr", "router", "speaker", "sensor", "io_module"] as DeviceType[]
      : [selectedDevice.type, "camera", "nvr", "router", "speaker", "sensor", "io_module"] as DeviceType[])
    : ["camera", "nvr", "router", "speaker", "sensor", "io_module"] as DeviceType[];

  return `
    <div class="site-management-modal-backdrop">
      <article class="site-management-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(selectedDevice ? `${formatDeviceTypeLabel(selectedDevice.type)} bearbeiten` : "Komponente hinzufuegen")}">
        ${renderSectionHeader(selectedDevice ? `${formatDeviceTypeLabel(selectedDevice.type)} bearbeiten` : "Komponente hinzufuegen", {
          subtitle: "Komponenten werden direkt aus der Komponentenliste im Popup bearbeitet.",
          actions: `<button type="button" id="site-management-device-modal-close-button" class="secondary">Schliessen</button>`
        })}
        <form id="device-form" class="stack" data-ui-preserve-form="true">
          <input type="hidden" name="id" value="${escapeHtml(selectedDevice?.id ?? "")}" />
          <label class="field"><span>Standort</span><select name="siteId" required>${renderSiteSelectOptionsWithSelection(overview, selectedSite.id)}</select></label>
          <label class="field"><span>Geraetetyp</span><select id="site-management-device-type-select" name="type">${renderDeviceTypeSelectOptions(allowedTypes, effectiveType)}</select></label>
          <div class="detail-grid">
            <label class="field"><span>Geraetename</span><input name="name" value="${escapeHtml(selectedDevice?.name ?? "")}" required /></label>
            <label class="field"><span>Hersteller</span><input name="vendor" value="${escapeHtml(selectedDevice?.vendor ?? "")}" /></label>
            <label class="field"><span>Modell</span><input name="model" value="${escapeHtml(selectedDevice?.model ?? "")}" /></label>
            <label class="field"><span>Seriennummer</span><input name="serialNumber" value="${escapeHtml(selectedDevice?.serialNumber ?? "")}" /></label>
            <label class="field"><span>Externe Geraete-ID</span><input name="externalDeviceId" value="${escapeHtml(selectedDevice?.externalDeviceId ?? "")}" /></label>
            <label class="field"><span>IP-Adresse / Netzwerkadresse</span><input name="networkAddress" value="${escapeHtml(selectedDevice?.networkAddress ?? "")}" /></label>
            <label class="field"><span>MAC-Adresse</span><input name="macAddress" value="${escapeHtml(selectedDevice?.macAddress ?? "")}" /></label>
            <label class="field"><span>Status</span><select name="status">${renderOptions(["planned", "installed", "retired"], selectedDevice?.status ?? "installed")}</select></label>
            <label class="field"><span>Aktiv</span><select name="isActive">${renderOptions(["true", "false"], selectedDevice?.isActive === false ? "false" : "true")}</select></label>
          </div>
          ${renderDeviceTypeSpecificFields(effectiveType, selectedSite, selectedDevice)}
          <div class="actions">
            <button type="submit">Speichern</button>
            ${selectedDevice ? `<button type="button" id="site-management-device-delete-button" class="secondary">Loeschen</button>` : ""}
            <button type="button" id="site-management-device-modal-cancel-button" class="secondary">Abbrechen</button>
          </div>
        </form>
      </article>
    </div>
  `;
}

function renderDeviceTypeSpecificFields(
  deviceType: DeviceType,
  selectedSite: MasterDataOverview["sites"][number],
  selectedDevice: SiteDevice | undefined
): string {
  if (isCameraType(deviceType)) {
    return `
      <div class="detail-grid">
        <label class="field"><span>Zugeordneter NVR</span><select name="linkedNvrDeviceId">${renderNvrDeviceOptions(selectedSite, selectedDevice?.linkedNvrDeviceId)}</select></label>
        <label class="field"><span>Kanal</span><input name="channelNumber" type="number" value="${selectedDevice?.channelNumber ?? ""}" /></label>
        <label class="field"><span>Bereich / Zone</span><input name="zone" value="${escapeHtml(selectedDevice?.zone ?? "")}" /></label>
        <label class="field"><span>Blickrichtung</span><input name="viewingDirection" value="${escapeHtml(selectedDevice?.viewingDirection ?? "")}" /></label>
        <label class="field"><span>Montageort</span><input name="mountLocation" value="${escapeHtml(selectedDevice?.mountLocation ?? "")}" /></label>
        <label class="field"><span>Analytics-Name</span><input name="analyticsName" value="${escapeHtml(selectedDevice?.analyticsName ?? "")}" /></label>
        <label class="field"><span>Rule-Name</span><input name="ruleName" value="${escapeHtml(selectedDevice?.ruleName ?? "")}" /></label>
      </div>
    `;
  }

  if (deviceType === "nvr") {
    return `
      <div class="detail-grid">
        <label class="field"><span>Anzahl Kanaele</span><input name="channelNumber" type="number" value="${selectedDevice?.channelNumber ?? ""}" /></label>
        <label class="field"><span>Storage / Speicher</span><input name="storageLabel" value="${escapeHtml(selectedDevice?.storageLabel ?? "")}" /></label>
        <label class="field"><span>Bereich / Zone</span><input name="zone" value="${escapeHtml(selectedDevice?.zone ?? "")}" /></label>
      </div>
    `;
  }

  if (deviceType === "router") {
    return `
      <div class="detail-grid">
        <label class="field"><span>WAN-IP</span><input name="wanIp" value="${escapeHtml(selectedDevice?.wanIp ?? "")}" /></label>
        <label class="field"><span>LAN-IP</span><input name="lanIp" value="${escapeHtml(selectedDevice?.lanIp ?? "")}" /></label>
        <label class="field"><span>VPN-Typ</span><input name="vpnType" value="${escapeHtml(selectedDevice?.vpnType ?? "")}" /></label>
        <label class="field"><span>Provider / SIM</span><input name="provider" value="${escapeHtml(selectedDevice?.provider ?? "")}" /></label>
        <label class="field"><span>SIM-Referenz</span><input name="simIdentifier" value="${escapeHtml(selectedDevice?.simIdentifier ?? "")}" /></label>
      </div>
    `;
  }

  if (deviceType === "speaker") {
    return `
      <div class="detail-grid">
        <label class="field"><span>Zone / Bereich</span><input name="audioZone" value="${escapeHtml(selectedDevice?.audioZone ?? selectedDevice?.zone ?? "")}" /></label>
        <label class="field"><span>Durchsagefaehig</span><select name="supportsPaging">${renderOptions(["", "true", "false"], typeof selectedDevice?.supportsPaging === "boolean" ? String(selectedDevice.supportsPaging) : "")}</select></label>
      </div>
    `;
  }

  return "";
}

function renderPlanForm(selectedSite: MasterDataOverview["sites"][number], overview: MasterDataOverview): string {
  return `
    <form id="plan-form" class="subcard stack" data-ui-preserve-form="true">
      <h3>Objekt-/Kameraplan pflegen</h3>
      <label class="field"><span>Standort</span><select name="siteId" required>${renderSiteSelectOptionsWithSelection(overview, selectedSite.id)}</select></label>
      <label class="field"><span>Planname</span><input name="name" placeholder="z. B. Objektplan EG" required /></label>
      <label class="field"><span>Plan-Typ</span><select name="kind">${renderOptions(planKindOptions, "site_plan")}</select></label>
      <label class="field"><span>Asset-Name</span><input name="assetName" placeholder="z. B. objektplan-eg.png" required /></label>
      <div class="detail-grid">
        <label class="field"><span>Marker-Label</span><input name="markerLabel" placeholder="z. B. Kamera Nordtor" required /></label>
        <label class="field"><span>Marker-Typ</span><select name="markerType">${renderOptions(["camera", "entry", "speaker", "custom"], "camera")}</select></label>
        <label class="field"><span>Marker X</span><input name="markerX" type="number" value="50" required /></label>
        <label class="field"><span>Marker Y</span><input name="markerY" type="number" value="50" required /></label>
      </div>
      <label class="field"><span>Device-ID optional</span><input name="deviceId" placeholder="Optional vorhandenes Geraet verknuepfen" /></label>
      <button type="submit">Plan speichern</button>
    </form>
  `;
}

function renderDeviceTable(
  selectedSite: MasterDataOverview["sites"][number],
  devices: SiteDevice[],
  emptyMessage: string,
  canEdit: boolean
): string {
  if (devices.length === 0) {
    return renderEmptyState(emptyMessage);
  }

  return `
    <div class="site-management-table-wrap">
      <table class="site-management-table">
        <thead>
          <tr>
            <th>Typ</th>
            <th>Name</th>
            <th>Hersteller</th>
            <th>Modell</th>
            <th>Seriennummer</th>
            <th>IP-Adresse</th>
            <th>Status</th>
            <th>Bereich / Zone</th>
            <th>Zugehoerigkeit</th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          ${devices.map((device) => `
            <tr>
              <td>${escapeHtml(formatDeviceTypeLabel(device.type))}</td>
              <td><button type="button" class="button-link site-management-component-open-button site-management-edit-device-button" data-device-id="${device.id}">${escapeHtml(device.name)}</button></td>
              <td>${escapeHtml(device.vendor ?? "-")}</td>
              <td>${escapeHtml(device.model ?? "-")}</td>
              <td>${escapeHtml(device.serialNumber ?? "-")}</td>
              <td>${escapeHtml(device.networkAddress ?? "-")}</td>
              <td>${renderPill(device.isActive ? "aktiv" : "inaktiv")} ${renderPill(device.status)}</td>
              <td>${escapeHtml(device.audioZone ?? device.zone ?? "-")}</td>
              <td>${escapeHtml(resolveLinkedNvrLabel(selectedSite, device.linkedNvrDeviceId) !== "-" ? resolveLinkedNvrLabel(selectedSite, device.linkedNvrDeviceId) : "-")}</td>
              <td>${canEdit ? `<button type="button" class="secondary site-management-edit-device-button" data-device-id="${device.id}">Bearbeiten</button>` : "-"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSettingsOverview(overview: MasterDataOverview): string {
  return `
    <section class="stack section">
      ${renderSectionHeader("Globale Einstellungen", {
        subtitle: "Leitstellenweite Grundkonfiguration fuer Monitoring, Eskalation und UI-Verhalten."
      })}
      <dl class="facts">
        <div><dt>Monitoring-Intervall</dt><dd>${overview.globalSettings.monitoringIntervalSeconds}s</dd></div>
        <div><dt>Fehlerschwelle</dt><dd>${overview.globalSettings.failureThreshold}</dd></div>
        <div><dt>UI-Dichte</dt><dd>${overview.globalSettings.uiDensity}</dd></div>
        <div><dt>Eskalationsprofil</dt><dd>${overview.globalSettings.escalationProfile}</dd></div>
        <div><dt>Workflow-Profil</dt><dd>${overview.globalSettings.workflowProfile}</dd></div>
        <div><dt>Passwortlaenge</dt><dd>${overview.globalSettings.passwordMinLength}</dd></div>
        <div><dt>Kiosk-Code-Laenge</dt><dd>${overview.globalSettings.kioskCodeLength}</dd></div>
      </dl>
    </section>
    <section class="stack section">
      ${renderSectionHeader("Standorteinstellungen", {
        subtitle: "Standortbezogene Monitoring- und Workflow-Einstellungen bleiben sichtbar getrennt von den globalen Defaults."
      })}
      <div class="stack compact">
        ${overview.sites.length > 0
          ? overview.sites.map((site) => `
            <article class="subcard stack compact">
              ${renderSectionHeader(site.siteName, {
                level: "h4",
                pills: [renderPill(site.status)]
              })}
              <p class="muted">${site.customer.name} | ${site.address.city}, ${site.address.country}</p>
              <dl class="facts compact-gap">
                <div><dt>Monitoring-Intervall</dt><dd>${site.settings.monitoringIntervalSeconds}s</dd></div>
                <div><dt>Fehlerschwelle</dt><dd>${site.settings.failureThreshold}</dd></div>
                <div><dt>Workflow-Profil</dt><dd>${site.settings.defaultWorkflowProfile}</dd></div>
                <div><dt>Alarm-Prioritaet</dt><dd>${site.settings.defaultAlarmPriority}</dd></div>
                <div><dt>Label-Modus</dt><dd>${site.settings.mapLabelMode}</dd></div>
                <div><dt>Kritische Geraete</dt><dd>${site.settings.highlightCriticalDevices ? "hervorheben" : "neutral"}</dd></div>
              </dl>
            </article>
          `).join("")
          : renderEmptyState("Noch keine Standorteinstellungen verfuegbar.")}
      </div>
    </section>
  `;
}

function renderSelectedSettingsSection(
  overview: MasterDataOverview | null,
  canEditSettings: boolean,
  selectedSection: SettingsSection
): string {
  switch (selectedSection) {
    case "general":
      return renderSettingsSubpage(
        "Allgemeine Einstellungen",
        "Systemweite Grundkonfiguration, Session-Kontext und Einsatzanweisungen bleiben in einem einheitlichen Rahmen gebuendelt.",
        renderGeneralSettingsContent(overview, canEditSettings),
        `
          <button type="button" id="refresh-overview-button" class="secondary">Einstellungen laden</button>
          <button type="button" id="refresh-instructions-button" class="secondary">Einsatzanweisungen laden</button>
        `
      );
    case "users":
      return renderSettingsSubpage(
        "Benutzer",
        "",
        renderSettingsUserSection()
      );
    case "roles":
      return renderSettingsSubpage(
        "Admin / Rollen & Rechte",
        "Zugang, Rollenmodell und Berechtigungsrahmen werden hier unter einer administrativen Sicht zusammengefuehrt, ohne neue CRUD-Strecken zu bauen.",
        renderAdminSettingsContent()
      );
    case "overview":
    default:
      return renderSettingsLanding(overview, canEditSettings);
  }
}

function renderSettingsLanding(overview: MasterDataOverview | null, canEditSettings: boolean): string {
  return `
    <article class="subcard stack">
      ${renderSectionHeader("Einstellungen", {
        subtitle: ""
      })}
      <div class="settings-overview-grid">
        ${settingsSections
          .filter((section) => section.id !== "overview")
          .map((section) => `
            <article class="subcard stack compact settings-overview-card">
              <strong>${section.label}</strong>
              ${section.description ? `<p class="muted">${section.description}</p>` : ""}
              <div class="actions">
                <button type="button" class="secondary settings-overview-link" data-settings-section="${section.id}">Bereich oeffnen</button>
              </div>
            </article>
          `).join("")}
      </div>
      <article class="subcard stack compact">
        ${renderSectionHeader("Status der vorhandenen Bereiche", {
          subtitle: "Der Ueberblick zeigt, welche vorhandenen Pfade bereits eingebunden sind und was bewusst nur als Rahmen vorbereitet bleibt."
        })}
        <dl class="facts compact-gap">
          <div><dt>Allgemein</dt><dd>${canEditSettings ? "pflegebereit" : "lesend"}</dd></div>
          <div><dt>Benutzer</dt><dd>${state.userAdministration ? `${state.userAdministration.users.length} Benutzer geladen` : "an bestehende Identity angebunden"}</dd></div>
          <div><dt>Admin / Rollen & Rechte</dt><dd>${userAdministrationRoleOptions.length} vorhandene Rollen im Modell</dd></div>
        </dl>
      </article>
    </article>
  `;
}

function renderSettingsSubpage(title: string, subtitle: string, content: string, actions = ""): string {
  return `
    <article class="subcard stack">
      ${renderSectionHeader(title, {
        subtitle,
        actions
      })}
      ${content}
    </article>
  `;
}

function renderGeneralSettingsContent(overview: MasterDataOverview | null, canEditSettings: boolean): string {
  return `
    ${overview ? renderSettingsOverview(overview) : renderEmptyState("Noch keine Einstellungen geladen.")}
    ${renderWorkflowProfilesSection()}
    ${renderGeneralSettingsForms(overview, canEditSettings)}
  `;
}

function renderGeneralSettingsForms(overview: MasterDataOverview | null, canEditSettings: boolean): string {
  const siteOptions = renderSiteOptions(overview);
  const globalDefaults = overview?.globalSettings ?? {
    monitoringIntervalSeconds: 90,
    failureThreshold: 3,
    uiDensity: "comfortable",
    escalationProfile: "standard",
    workflowProfile: "default",
    passwordMinLength: 8,
    kioskCodeLength: 6
  };
  return `
    <section class="forms-grid">
      <article class="subcard stack">
        <h3>Lokale UI-Einstellungen</h3>
        <p class="muted">Diese Einstellung wirkt direkt in diesem Browser und vereinfacht die Bedienung des Hauptmenues.</p>
        <label class="field">
          <span>Position Hauptmenue</span>
          <select id="shell-menu-position-select" name="shellMenuPosition">${renderOptions(["left", "top"], state.shellMenuPosition)}</select>
        </label>
        <label class="field">
          <span>Fehlalarm-Klickverhalten</span>
          <select id="false-alarm-close-mode-select" name="falseAlarmCloseMode">${renderOptions(["confirm", "instant"], state.falseAlarmCloseMode)}</select>
        </label>
        <p class="muted">Gilt fuer den Alarm-Eingangsscreen: Klick auf "Fehlalarm setzen und schliessen" entweder mit Rueckfrage oder direkt.</p>
      </article>
      ${canEditSettings
        ? `
          <form id="global-settings-form" class="subcard stack" data-ui-preserve-form="true">
            <h3>Globale Einstellungen pflegen</h3>
            <label class="field"><span>Monitoring-Intervall</span><input name="monitoringIntervalSeconds" type="number" value="${globalDefaults.monitoringIntervalSeconds}" required /></label>
            <label class="field"><span>Fehlerschwelle</span><input name="failureThreshold" type="number" value="${globalDefaults.failureThreshold}" required /></label>
            <label class="field"><span>UI-Dichte</span><select name="uiDensity">${renderOptions(["comfortable", "compact"], globalDefaults.uiDensity)}</select></label>
            <label class="field"><span>Eskalationsprofil</span><select name="escalationProfile">${renderOptions(["standard", "elevated"], globalDefaults.escalationProfile)}</select></label>
            <label class="field"><span>Workflow-Profil</span><select name="workflowProfile">${renderOptions(["default", "weekend_sensitive"], globalDefaults.workflowProfile)}</select></label>
            <label class="field"><span>Passwortlaenge</span><input name="passwordMinLength" type="number" min="4" max="128" value="${globalDefaults.passwordMinLength}" required /></label>
            <label class="field"><span>Kiosk-Code-Laenge</span><input name="kioskCodeLength" type="number" min="4" max="24" value="${globalDefaults.kioskCodeLength}" required /></label>
            <button type="submit">Globale Einstellungen speichern</button>
          </form>
        `
        : `
          <article class="subcard stack">
            <h3>Globale Einstellungen</h3>
            <p class="muted">Die Werte bleiben sichtbar. Pflege ist auf Administration und Leitstellenleitung beschraenkt.</p>
            <dl class="facts compact-gap">
              <div><dt>Monitoring-Intervall</dt><dd>${globalDefaults.monitoringIntervalSeconds}s</dd></div>
              <div><dt>Fehlerschwelle</dt><dd>${globalDefaults.failureThreshold}</dd></div>
              <div><dt>UI-Dichte</dt><dd>${escapeHtml(globalDefaults.uiDensity)}</dd></div>
              <div><dt>Eskalationsprofil</dt><dd>${escapeHtml(globalDefaults.escalationProfile)}</dd></div>
              <div><dt>Workflow-Profil</dt><dd>${escapeHtml(globalDefaults.workflowProfile)}</dd></div>
              <div><dt>Passwortlaenge</dt><dd>${globalDefaults.passwordMinLength}</dd></div>
              <div><dt>Kiosk-Code-Laenge</dt><dd>${globalDefaults.kioskCodeLength}</dd></div>
            </dl>
          </article>
        `}
      ${canEditSettings
        ? `
          <form id="workflow-profile-form" class="subcard stack" data-ui-preserve-form="true">
            <h3>Einsatzanweisung pflegen</h3>
            <label class="field"><span>Standort</span><select name="siteId" required>${siteOptions}</select></label>
            <label class="field"><span>Code</span><input name="code" value="site_instruction_profile" required /></label>
            <label class="field"><span>Bezeichnung</span><input name="label" value="Standort Anweisung" required /></label>
            <label class="field"><span>Beschreibung</span><input name="description" value="Einfache Einsatzanweisung fuer den Standort." /></label>
            <label class="field"><span>Zeitkontext</span><select name="timeContext">${renderOptions(["normal", "weekend", "special"], "normal")}</select></label>
            <label class="field"><span>Sonderlage-Label</span><input name="specialContextLabel" placeholder="z. B. storm_mode" /></label>
            <label class="field"><span>Aktiv von</span><input name="activeFromTime" value="08:00:00" /></label>
            <label class="field"><span>Aktiv bis</span><input name="activeToTime" value="18:00:00" /></label>
            <label class="field"><span>Sortierung</span><input name="sortOrder" type="number" value="40" required /></label>
            <label class="field"><span>Pflichtschritt vorbereiten</span><input name="requiredStepTitle" value="Kundenkontakt herstellen" required /></label>
            <label class="field"><span>Pflichtschritt Anweisung</span><input name="requiredStepInstruction" value="Kundenkontakt gemaess Standortvorgabe herstellen." required /></label>
            <label class="field"><span>Optionale Eskalation</span><input name="optionalStepTitle" value="Sicherheitsdienst informieren" required /></label>
            <button type="submit">Einsatzanweisung speichern</button>
          </form>
        `
        : `
          <article class="subcard stack">
            <h3>Einsatzanweisungen</h3>
            <p class="muted">Vorhandene Einsatzanweisungen bleiben lesbar. Pflege ist auf Administration und Leitstellenleitung beschraenkt.</p>
            ${renderNotice("Die fachliche Logik fuer Einsatzanweisungen bleibt unveraendert; hier wird nur die schreibende UI nach Rollen begrenzt.", "default", true)}
          </article>
        `}
    </section>
  `;
}

function renderAdminSettingsContent(): string {
  return `
    <section class="stack">
      ${renderSettingsAccessSection()}
      ${renderRoleRightsContent()}
      <article class="subcard stack compact">
        <h3>Admin-Fuehrung</h3>
        <p class="muted">Von hier aus werden die vorhandenen administrativen Teilbereiche weitergefuehrt, ohne eine zweite Admin-Navigation aufzubauen.</p>
        <div class="actions">
          <button type="button" class="secondary settings-overview-link" data-settings-section="users">Benutzer oeffnen</button>
          <button type="button" class="secondary settings-overview-link" data-settings-section="general">Allgemeine Einstellungen</button>
        </div>
      </article>
    </section>
  `;
}

function renderRoleRightsContent(): string {
  return `
    <section class="stack">
      <article class="subcard stack compact">
        <h3>Vorhandenes Rollenmodell</h3>
        <p class="muted">Die Anwendung nutzt bereits Mehrfachrollen ueber die Identity-Schicht. Rollenpruefungen erfolgen gegen das Rollenarray und nicht nur gegen eine Primaerrolle.</p>
        <div class="actions">
          ${userAdministrationRoleOptions.map((role) => renderPill(formatUserRoleLabel(role))).join("")}
        </div>
      </article>
      <article class="subcard stack compact">
        <h3>Rechte-Rahmen</h3>
        <p class="muted">Dieser Unterpunkt fuehrt die vorhandene Rollen- und Rechte-Systematik zusammen, ohne in diesem Schritt eine neue CRUD- oder Permission-Welt zu bauen.</p>
        <ul class="plain-list">
          <li>Benutzer- und Settings-Pflege bleibt auf Administration und Leitstellenleitung beschraenkt.</li>
          <li>Operative Bereiche wie Alarmannahme, Operator-Screen und Wallboard bleiben davon fachlich getrennt.</li>
          <li>Legacy-Zugaenge bleiben technisch kompatibel, die sichtbare Hauptfuehrung laeuft aber ueber Einstellungen.</li>
          <li>Eine spaetere vertiefte Rollen-/Rechtepflege kann hier ohne Navigationsbruch andocken.</li>
        </ul>
      </article>
    </section>
  `;
}

function renderSiteSettingsMirrorContent(overview: MasterDataOverview | null): string {
  const visibleSites = overview?.sites.filter((site) => !site.isArchived) ?? [];
  return `
    <section class="stack">
      <article class="subcard stack compact">
        <h3>Globale Standortkontexte</h3>
        <p class="muted">Standortbezogene Einstellungen werden weiterhin im Hauptbereich Standorte gepflegt. Unter Einstellungen bleibt nur der globale, gespiegelt dargestellte Konfigurationskontext sichtbar.</p>
        ${visibleSites.length
          ? `<ul class="plain-list">${visibleSites.map((site) => `<li><strong>${escapeHtml(site.siteName)}</strong> | Monitoring ${site.settings.monitoringIntervalSeconds}s | Schwelle ${site.settings.failureThreshold} | Workflow ${escapeHtml(site.settings.defaultWorkflowProfile)}</li>`).join("")}</ul>`
          : renderEmptyState("Noch keine Standorte zum Konfigurieren vorhanden.")}
      </article>
      <article class="subcard stack compact">
        <h3>Abgrenzung zum Hauptbereich Standorte</h3>
        ${renderNotice("Hier wird bewusst keine zweite Standortverwaltung aufgebaut. Operative Stammdaten, Technik, Netzwerk, Audio und Alarmquellen bleiben im Hauptmenuepunkt Standorte.", "default", true)}
      </article>
    </section>
  `;
}

export function renderWorkflowProfilesSection(): string {
  if (state.workflowProfiles.length === 0) return renderEmptyState("Noch keine Einsatzanweisungen geladen.");
  return `
    <section class="stack section">
      ${renderSectionHeader("Einsatzanweisungen")}
      ${state.workflowProfiles.map(renderInstructionProfile).join("")}
    </section>
  `;
}

function getFilteredSites(overview: MasterDataOverview): MasterDataOverview["sites"] {
  const query = state.siteManagementSearch.trim().toLowerCase();
  return overview.sites.filter((site) => {
    if (site.isArchived && !state.siteManagementShowArchived) {
      return false;
    }
    if (state.siteManagementStatusFilter !== "all" && site.status !== state.siteManagementStatusFilter) {
      return false;
    }
    if (!query) {
      return true;
    }
    return [
      site.siteName,
      site.customer.name,
      site.address.city,
      site.address.postalCode,
      site.internalReference ?? "",
      site.contactPerson ?? ""
    ].some((entry) => entry.toLowerCase().includes(query));
  });
}

function resolveSelectedSite(
  overview: MasterDataOverview,
  filteredSites: MasterDataOverview["sites"]
): MasterDataOverview["sites"][number] | undefined {
  const preferredId = state.selectedSiteId ?? state.selectedMapSiteId;
  return filteredSites.find((site) => site.id === preferredId)
    ?? overview.sites.find((site) => site.id === preferredId)
    ?? filteredSites[0]
    ?? overview.sites[0];
}

function renderSiteStatusFilterOptions(): string {
  return [
    `<option value="all" ${state.siteManagementStatusFilter === "all" ? "selected" : ""}>alle Stati</option>`,
    ...siteStatusOptions.map((status) => `<option value="${status}" ${state.siteManagementStatusFilter === status ? "selected" : ""}>${status}</option>`)
  ].join("");
}

function renderCustomerSelectOptions(overview: MasterDataOverview, selectedCustomerId: string): string {
  return overview.customers.map((customer) => `
    <option value="${escapeHtml(customer.id)}" ${customer.id === selectedCustomerId ? "selected" : ""}>${escapeHtml(customer.name)}</option>
  `).join("");
}

function renderSiteSelectOptionsWithSelection(overview: MasterDataOverview, selectedSiteId: string): string {
  return overview.sites.map((site) => `
    <option value="${escapeHtml(site.id)}" ${site.id === selectedSiteId ? "selected" : ""}>${escapeHtml(site.siteName)}</option>
  `).join("");
}

function renderDeviceTypeSelectOptions(allowedTypes: DeviceType[], selectedType: DeviceType): string {
  return allowedTypes.map((type) => `
    <option value="${type}" ${type === selectedType ? "selected" : ""}>${escapeHtml(formatDeviceTypeLabel(type))}</option>
  `).join("");
}

function renderNvrDeviceOptions(selectedSite: MasterDataOverview["sites"][number], selectedDeviceId: string | undefined): string {
  const nvrDevices = selectedSite.devices.filter((device) => device.type === "nvr");
  return [
    `<option value="">kein NVR</option>`,
    ...nvrDevices.map((device) => `
      <option value="${escapeHtml(device.id)}" ${device.id === selectedDeviceId ? "selected" : ""}>${escapeHtml(device.name)}</option>
    `)
  ].join("");
}

function renderSiteComponentOptions(selectedSite: MasterDataOverview["sites"][number], selectedComponentId: string | undefined): string {
  return selectedSite.devices.map((device) => `
    <option value="${escapeHtml(device.id)}" ${device.id === selectedComponentId ? "selected" : ""}>${escapeHtml(`${device.name} (${formatDeviceTypeLabel(device.type)})`)}</option>
  `).join("");
}

function resolveSiteComponentLabel(selectedSite: MasterDataOverview["sites"][number], componentId: string | undefined): string {
  if (!componentId) {
    return "-";
  }
  const device = selectedSite.devices.find((entry) => entry.id === componentId);
  if (!device) {
    return componentId;
  }
  return `${device.name} (${formatDeviceTypeLabel(device.type)})`;
}

function formatAlarmSourceMappingKeys(
  mapping: MasterDataOverview["sites"][number]["alarmSourceMappings"][number]
): string {
  const parts = [
    mapping.externalSourceKey ? `source=${mapping.externalSourceKey}` : null,
    mapping.externalDeviceId ? `device=${mapping.externalDeviceId}` : null,
    mapping.externalRecorderId ? `recorder=${mapping.externalRecorderId}` : null,
    mapping.channelNumber !== undefined ? `channel=${mapping.channelNumber}` : null,
    mapping.serialNumber ? `serial=${mapping.serialNumber}` : null,
    mapping.analyticsName ? `analytics=${mapping.analyticsName}` : null,
    mapping.eventNamespace ? `namespace=${mapping.eventNamespace}` : null
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" | ") : "nur Vendor / Source-Type";
}

function renderMediaBundleProfileOptions(selectedValue: string | undefined): string {
  return mediaBundleProfileKeys.map((key) => `
    <option value="${escapeHtml(key)}" ${key === (selectedValue ?? "event_without_media") ? "selected" : ""}>${escapeHtml(formatMediaBundleProfileLabel(key))}</option>
  `).join("");
}

function formatMediaBundleProfileLabel(value: string | undefined): string {
  if (!value) {
    return "Kein Profil";
  }
  return mediaBundleProfileLabels[value as keyof typeof mediaBundleProfileLabels] ?? value;
}

function formatDeviceTypeLabel(type: DeviceType): string {
  switch (type) {
    case "router":
      return "Router";
    case "nvr":
      return "NVR";
    case "camera":
      return "Kamera";
    case "dome_ptz_camera":
      return "PTZ-Kamera";
    case "bi_spectral_camera":
      return "Bi-spectral-Kamera";
    case "speaker":
      return "Lautsprecher";
    case "sensor":
      return "Sensor";
    case "io_module":
      return "IO-Modul";
    default:
      return type;
  }
}

function isCameraType(type: DeviceType): boolean {
  return type === "camera" || type === "dome_ptz_camera" || type === "bi_spectral_camera";
}

function formatSiteLifecycleLabel(status: MasterDataOverview["sites"][number]["status"]): string {
  switch (status) {
    case "active":
      return "aktiv";
    case "planned":
      return "geplant";
    case "limited":
      return "eingeschraenkt";
    case "offline":
      return "offline";
    default:
      return status;
  }
}

function renderSiteArchivePill(): string {
  return renderPill("archiviert", "site-archive-pill");
}

function renderSiteArchiveToggleButton(site: MasterDataOverview["sites"][number]): string {
  return `<button type="button" class="secondary site-management-toggle-archive-button${site.isArchived ? "" : " site-management-archive-button"}" data-site-id="${site.id}">${site.isArchived ? "Reaktivieren" : "Archivieren"}</button>`;
}

function getSiteOperationalStatusLabel(site: MasterDataOverview["sites"][number]): string {
  if (hasOpenAlarm(site)) {
    return "Alarm";
  }
  switch (site.technicalStatus.overallStatus) {
    case "ok":
      return "Online";
    case "disturbed":
      return "Warnung";
    case "offline":
      return "Offline";
    default:
      return "Unbekannt";
  }
}

function getSiteOperationalStatusTone(site: MasterDataOverview["sites"][number]): string {
  if (hasOpenAlarm(site)) {
    return "alarm";
  }
  switch (site.technicalStatus.overallStatus) {
    case "ok":
      return "ok";
    case "disturbed":
      return "warning";
    case "offline":
      return "offline";
    default:
      return "unknown";
  }
}

function isSiteHealthy(site: MasterDataOverview["sites"][number]): boolean {
  return !hasOpenAlarm(site) && site.technicalStatus.overallStatus === "ok";
}

function hasOpenAlarm(site: MasterDataOverview["sites"][number]): boolean {
  return state.siteMarkers?.markers.some((marker) => marker.siteId === site.id && marker.hasOpenAlarm) ?? false;
}

function formatAddress(site: MasterDataOverview["sites"][number]): string {
  const streetLine = [site.address.street, site.address.houseNumber].filter(Boolean).join(" ");
  return `${streetLine}, ${site.address.postalCode} ${site.address.city}, ${site.address.country}`;
}

function resolveLinkedNvrLabel(selectedSite: MasterDataOverview["sites"][number], linkedNvrDeviceId: string | undefined): string {
  if (!linkedNvrDeviceId) {
    return "-";
  }
  return selectedSite.devices.find((device) => device.id === linkedNvrDeviceId)?.name ?? linkedNvrDeviceId;
}
