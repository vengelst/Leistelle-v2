import type { SiteMapMarkerCollection } from "@leitstelle/contracts";

import { state } from "../state.js";
import { formatDuration, formatTimestamp } from "../utils.js";
import {
  listMapSiteAlarms,
  listMapSiteDisturbances,
  projectMarkerPosition,
  renderSitePlanWorkspace
} from "./common.js";

export function renderMapSection(): string {
  if (!state.session) {
    return `<p class="empty">Nach dem Login wird die DACH-Karte mit Standortmarkern geladen.</p>`;
  }

  const markerCollection = state.siteMarkers;
  const selectedMarker = markerCollection?.markers.find((marker) => marker.siteId === state.selectedMapSiteId) ?? markerCollection?.markers[0];

  if (!markerCollection || markerCollection.markers.length === 0) {
    return `<p class="empty">Noch keine Standorte mit Geo-Koordinaten verfuegbar.</p>`;
  }

  return `
    <section class="map-shell">
      <div class="map-toolbar">
        <div class="actions">
          <button type="button" id="refresh-map-button" class="secondary">Karte aktualisieren</button>
          ${selectedMarker ? `<button type="button" id="focus-site-button" class="secondary" data-site-id="${selectedMarker.siteId}">Standort in Pipelines fokussieren</button>` : ""}
        </div>
        <div class="actions map-legend">
          <span class="legend-item"><span class="legend-dot marker-ok"></span>ok</span>
          <span class="legend-item"><span class="legend-dot marker-disturbed"></span>technische Stoerung</span>
          <span class="legend-item"><span class="legend-dot marker-offline"></span>offline</span>
          <span class="legend-item"><span class="legend-dot marker-alarm"></span>Alarmhinweis</span>
        </div>
      </div>
      <div class="map-layout">
        <section class="map-stage" aria-label="DACH-Karte">
          <div class="map-canvas">
            <svg class="dach-map" viewBox="0 0 1000 700" preserveAspectRatio="none" role="img" aria-label="DACH-Raum mit Standortmarkern">
              <defs>
                <linearGradient id="mapSurface" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stop-color="rgba(255,255,255,0.95)" />
                  <stop offset="100%" stop-color="rgba(238,230,214,0.9)" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="1000" height="700" rx="28" fill="url(#mapSurface)"></rect>
              <g class="map-grid">
                <path d="M100 90 H920" />
                <path d="M100 220 H920" />
                <path d="M100 350 H920" />
                <path d="M100 480 H920" />
                <path d="M100 610 H920" />
                <path d="M180 70 V630" />
                <path d="M350 70 V630" />
                <path d="M520 70 V630" />
                <path d="M690 70 V630" />
                <path d="M860 70 V630" />
              </g>
              <g class="map-country-layer">
                <path class="country germany" d="M410 70 L520 72 L616 115 L684 188 L668 268 L707 350 L660 452 L604 532 L520 585 L440 565 L372 602 L292 566 L254 478 L270 386 L305 287 L360 205 L387 121 Z" />
                <path class="country austria" d="M428 488 L514 460 L634 475 L745 518 L670 556 L546 575 L430 562 L355 530 Z" />
                <path class="country switzerland" d="M264 478 L345 458 L438 474 L422 523 L333 538 L252 516 Z" />
              </g>
              <g class="map-label-layer">
                <text x="457" y="290">DE</text>
                <text x="548" y="540">AT</text>
                <text x="314" y="515">CH</text>
              </g>
            </svg>
            <div class="map-marker-layer">
              ${markerCollection.markers.map((marker) => renderMapMarker(marker, selectedMarker?.siteId === marker.siteId)).join("")}
            </div>
          </div>
        </section>
        ${selectedMarker ? renderMapSelectionPanel(selectedMarker) : `<aside class="subcard stack"><p class="empty">Standortmarker waehlen, um Details zu sehen.</p></aside>`}
      </div>
    </section>
  `;
}

export function renderMapMarker(marker: SiteMapMarkerCollection["markers"][number], isSelected: boolean): string {
  const position = projectMarkerPosition(marker.latitude, marker.longitude);
  const statusClass = marker.technicalStatus.overallStatus === "offline"
    ? "marker-offline"
    : marker.technicalStatus.overallStatus === "disturbed"
      ? "marker-disturbed"
      : "marker-ok";
  const alarmClass = marker.hasOpenAlarm ? " marker-has-alarm" : "";

  return `
    <button
      type="button"
      class="map-marker-button ${statusClass}${alarmClass}${isSelected ? " selected" : ""}"
      data-site-id="${marker.siteId}"
      style="left:${position.left}%;top:${position.top}%"
      aria-label="${marker.siteName}, Status ${marker.technicalStatus.overallStatus}"
      title="${marker.siteName} | ${marker.customerName} | Alarm ${marker.openAlarmCount} | Stoerungen ${marker.openDisturbanceCount}"
    >
      <span class="map-marker-core"></span>
      <span class="map-marker-label">${marker.siteName}</span>
      ${marker.openDisturbanceCount > 0 ? `<span class="map-marker-count">${marker.openDisturbanceCount}</span>` : ""}
    </button>
  `;
}

export function renderMapSelectionPanel(marker: SiteMapMarkerCollection["markers"][number]): string {
  const site = state.overview?.sites.find((entry) => entry.id === marker.siteId);
  const siteAlarms = listMapSiteAlarms(marker.siteId);
  const siteDisturbances = listMapSiteDisturbances(marker.siteId);
  const serviceContext = siteDisturbances.find((entry) => entry.serviceCaseId);
  const sitePlanWorkspace = site ? renderSitePlanWorkspace(site.id, "site") : "";

  return `
    <aside class="subcard stack map-selection-panel" data-ui-preserve-scroll="map-selection-panel">
      <div class="actions">
        <strong>${marker.siteName}</strong>
        <span class="pill monitoring-site-${marker.technicalStatus.overallStatus}">${marker.technicalStatus.overallStatus}</span>
        ${marker.hasOpenAlarm ? `<span class="pill priority-high">Alarm</span>` : ""}
      </div>
      <p class="muted">${marker.customerName} | ${marker.latitude.toFixed(4)}, ${marker.longitude.toFixed(4)}</p>
      <dl class="facts compact-gap">
        <div><dt>Offene Alarme</dt><dd>${marker.openAlarmCount}</dd></div>
        <div><dt>Offene Stoerungen</dt><dd>${marker.openDisturbanceCount}</dd></div>
        <div><dt>Technikstatus seit</dt><dd>${formatTimestamp(marker.technicalStatus.updatedAt)}</dd></div>
        <div><dt>Region-Hinweis</dt><dd>DACH</dd></div>
      </dl>
      <div class="actions">
        <button type="button" class="secondary map-site-details-button" data-site-id="${marker.siteId}">Standortdetails</button>
        <button type="button" class="secondary map-focus-button" data-site-id="${marker.siteId}">Alarme + Stoerungen filtern</button>
        <button type="button" class="secondary map-alarm-focus-button" data-site-id="${marker.siteId}">Nur Alarm-Pipeline</button>
        <button type="button" class="secondary map-monitoring-focus-button" data-site-id="${marker.siteId}">Nur Stoerungen</button>
      </div>
      <div class="map-context-grid">
        <section class="subcard stack compact map-context-card">
          <h4>Standortkontext</h4>
          ${site ? `
            <p>${site.address.street}, ${site.address.postalCode} ${site.address.city}, ${site.address.country}</p>
            <p class="muted">Standortstatus ${site.status} | Monitoring ${site.settings.monitoringIntervalSeconds}s | Schwelle ${site.settings.failureThreshold}</p>
            ${sitePlanWorkspace}
          ` : `<p class="muted">Standortdetails sind im Stammdatenbereich verfuegbar.</p>`}
        </section>
        <section class="subcard stack compact map-context-card">
          <div class="actions">
            <h4>Offene Alarme</h4>
            ${siteAlarms[0] ? `<button type="button" class="secondary map-open-first-alarm-button" data-alarm-case-id="${siteAlarms[0].id}">Ersten Alarm oeffnen</button>` : ""}
          </div>
          ${siteAlarms.length > 0 ? `
            <div class="stack compact map-context-list">
              ${siteAlarms.slice(0, 3).map((alarm) => `
                <article class="map-context-item">
                  <div class="actions">
                    <strong>${alarm.title}</strong>
                    <span class="pill priority-${alarm.priority}">${alarm.priority}</span>
                  </div>
                  <p class="muted">${formatTimestamp(alarm.receivedAt)} | ${alarm.lifecycleStatus} | ${alarm.assessmentStatus}</p>
                  <button type="button" class="secondary map-open-alarm-button" data-alarm-case-id="${alarm.id}">Alarmkontext oeffnen</button>
                </article>
              `).join("")}
            </div>
          ` : `<p class="empty">Aktuell keine offenen Alarme fuer diesen Standort.</p>`}
        </section>
        <section class="subcard stack compact map-context-card">
          <div class="actions">
            <h4>Offene Stoerungen</h4>
            ${siteDisturbances[0] ? `<button type="button" class="secondary map-open-first-disturbance-button" data-disturbance-id="${siteDisturbances[0].id}">Erste Stoerung oeffnen</button>` : ""}
          </div>
          ${siteDisturbances.length > 0 ? `
            <div class="stack compact map-context-list">
              ${siteDisturbances.slice(0, 3).map((disturbance) => `
                <article class="map-context-item ${disturbance.isCritical || disturbance.siteTechnicalStatus === "offline" ? "monitoring-critical" : ""}">
                  <div class="actions">
                    <strong>${disturbance.title}</strong>
                    <span class="pill priority-${disturbance.priority}">${disturbance.priority}</span>
                  </div>
                  <p class="muted">${disturbance.disturbanceTypeLabel} | ${formatDuration(disturbance.durationSeconds)} | ${disturbance.status}</p>
                  <button type="button" class="secondary map-open-disturbance-button" data-disturbance-id="${disturbance.id}">Stoerungsdetail oeffnen</button>
                </article>
              `).join("")}
            </div>
          ` : `<p class="empty">Aktuell keine offenen Stoerungen fuer diesen Standort.</p>`}
        </section>
      </div>
      ${serviceContext ? `
        <section class="subcard stack compact map-context-card">
          <div class="actions">
            <h4>Servicekontext</h4>
            <span class="pill monitoring-status-${serviceContext.status}">${serviceContext.serviceCaseStatus ?? "open"}</span>
          </div>
          <p class="muted">${serviceContext.title} | ${serviceContext.referenceLabel ?? serviceContext.deviceName ?? marker.siteName}</p>
          <button type="button" class="secondary map-open-service-context-button" data-disturbance-id="${serviceContext.id}">Servicefall aus Stoerung oeffnen</button>
        </section>
      ` : ""}
      <p class="muted">Die Karte bleibt Arbeitsuebersicht: Marker waehlen, Standort fokussieren und ohne neue Parallelseiten direkt in Alarm-, Stoerungs- oder vorhandenen Servicekontext springen.</p>
    </aside>
  `;
}
