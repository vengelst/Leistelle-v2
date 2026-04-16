/**
 * Rendert die operative Dashboard-Uebersicht mit Kennzahlen, Highlights und Schichtblock.
 */
import { state } from "../state.js";
import { formatTimestamp } from "../utils.js";
import { canAccessArchiveWorkspace } from "./auth.js";
import { renderEmptyState, renderPill, renderSectionHeader } from "./common.js";
import { renderShiftPlanningSection } from "./shifts.js";

export function renderDashboardSection(): string {
  if (!state.session) {
    return renderEmptyState("Nach dem Login wird die operative Startuebersicht mit Kennzahlen geladen.");
  }

  if (!state.dashboard) {
    return `
      <div class="actions">
        <button type="button" id="refresh-dashboard-button" class="secondary">Dashboard laden</button>
      </div>
      ${renderEmptyState("Noch keine Dashboard-Kennzahlen geladen.")}
    `;
  }

  const { metrics, highlights } = state.dashboard;
  return `
    <section class="stack">
      <div class="actions">
        <button type="button" id="refresh-dashboard-button" class="secondary">Dashboard aktualisieren</button>
        ${canAccessArchiveWorkspace() ? `<button type="button" class="secondary dashboard-jump-button" data-region-id="archive">Zur Archivsicht</button>` : ""}
        <button type="button" class="secondary dashboard-jump-button" data-region-id="reporting">Zum Reporting</button>
      </div>
      <section class="dashboard-metrics">
        ${[
          metrics.openAlarms,
          metrics.openDisturbances,
          metrics.todaysFalsePositives,
          metrics.criticalSites,
          metrics.activeOperators
        ].map((metric) => `
          <article class="subcard dashboard-metric">
            <strong>${metric.label}</strong>
            <span class="dashboard-metric-value">${metric.value}</span>
            ${metric.hint ? `<p class="muted">${metric.hint}</p>` : ""}
          </article>
        `).join("")}
      </section>
      <section class="detail-grid">
          <article class="subcard stack compact">
          ${renderSectionHeader("Alarm-Highlights", {
            actions: `<button type="button" class="secondary dashboard-jump-button" data-region-id="pipeline">Zur Alarm-Pipeline</button>`
          })}
          ${highlights.alarms.length > 0
            ? `<ul class="plain-list">${highlights.alarms.map((alarm) => `<li><strong>${alarm.title}</strong> | ${renderPill(alarm.priority, `priority-${alarm.priority}`)} | ${alarm.siteName}<br/>${alarm.customerName} | ${formatTimestamp(alarm.receivedAt)}<br/><button type="button" class="secondary dashboard-open-alarm-button" data-alarm-case-id="${alarm.id}">Alarm oeffnen</button></li>`).join("")}</ul>`
            : renderEmptyState("Aktuell keine offenen Alarm-Highlights.")}
        </article>
        <article class="subcard stack compact">
          ${renderSectionHeader("Stoerungs-Highlights", {
            actions: `<button type="button" class="secondary dashboard-jump-button" data-region-id="monitoring">Zur Stoerungspipeline</button>`
          })}
          ${highlights.disturbances.length > 0
            ? `<ul class="plain-list">${highlights.disturbances.map((disturbance) => `<li><strong>${disturbance.title}</strong> | ${renderPill(disturbance.priority, `priority-${disturbance.priority}`)} | ${disturbance.siteName}<br/>${disturbance.customerName} | ${disturbance.siteTechnicalStatus} | ${formatTimestamp(disturbance.startedAt)}<br/><button type="button" class="secondary dashboard-open-disturbance-button" data-disturbance-id="${disturbance.id}">Stoerung oeffnen</button></li>`).join("")}</ul>`
            : renderEmptyState("Aktuell keine offenen Stoerungs-Highlights.")}
        </article>
      </section>
      <section class="detail-grid">
        <article class="subcard stack compact">
          ${renderSectionHeader("Kritische Standorte", {
            actions: `<button type="button" class="secondary dashboard-jump-button" data-region-id="map">Zur Karte</button>`
          })}
          ${highlights.criticalSites.length > 0
            ? `<ul class="plain-list">${highlights.criticalSites.map((site) => `<li><strong>${site.siteName}</strong> | ${renderPill(site.siteTechnicalStatus)}<br/>${site.customerName} | Alarme ${site.openAlarmCount} | Stoerungen ${site.openDisturbanceCount}<br/><button type="button" class="secondary dashboard-focus-site-button" data-site-id="${site.siteId}">Standort fokussieren</button></li>`).join("")}</ul>`
            : renderEmptyState("Aktuell keine kritischen Standorte.")}
        </article>
        <article class="subcard stack compact">
          ${renderSectionHeader("Aktive Operatoren", {
            actions: `<button type="button" class="secondary dashboard-jump-button" data-region-id="authentication">Zur Session-Sicht</button>`
          })}
          ${highlights.activeOperators.length > 0
            ? `<ul class="plain-list">${highlights.activeOperators.map((operator) => `<li><strong>${operator.displayName}</strong> | ${renderPill(operator.status)}<br/>${operator.primaryRole} | ${formatTimestamp(operator.lastStatusChangeAt)}</li>`).join("")}</ul>`
            : renderEmptyState("Aktuell keine aktiven Operatoren.")}
        </article>
      </section>
      <article class="subcard stack">
        ${renderShiftPlanningSection()}
      </article>
    </section>
  `;
}
