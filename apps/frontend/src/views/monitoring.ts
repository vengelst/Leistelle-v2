/**
 * Views fuer die technische Stoerungspipeline.
 *
 * Die Datei stellt Filter, offene Stoerungen und den Detailbereich fuer eine
 * selektierte technische Stoerung dar.
 */
import type { MonitoringPipelineItem } from "@leitstelle/contracts";

import { state } from "../state.js";
import { formatDuration, formatTimestamp } from "../utils.js";
import {
  renderEmptyState,
  renderMonitoringPriorityOptions,
  renderMonitoringSiteStatusOptions,
  renderNotice,
  renderPill,
  renderPipelineSiteOptions,
  renderPriorityPill,
  renderSectionHeader,
  renderSitePlanWorkspace
} from "./common.js";

export function renderMonitoringSection(): string {
  if (!state.session) return renderEmptyState("Nach dem Login kann die Stoerungspipeline geladen werden.");
  return `
    ${renderMonitoringFilterForm()}
    ${renderMonitoringPipelineList()}
    ${renderMonitoringDetailSection()}
  `;
}

export function renderMonitoringFilterForm(): string {
  return `
    <form id="monitoring-filter-form" class="subcard stack" data-ui-preserve-form="true">
      <div class="actions">
        <button type="submit" class="secondary">Stoerungen laden</button>
        <button type="button" id="monitoring-reset-button" class="secondary">Filter zuruecksetzen</button>
      </div>
      <label class="field"><span>Standortfilter</span><select name="siteId">${renderPipelineSiteOptions()}</select></label>
      <label class="field"><span>Prioritaet</span><select name="priority">${renderMonitoringPriorityOptions()}</select></label>
      <label class="field"><span>Standortstatus</span><select name="siteTechnicalStatus">${renderMonitoringSiteStatusOptions()}</select></label>
    </form>
  `;
}

export function renderMonitoringPipelineList(): string {
  if (state.openDisturbances.length === 0) {
    return renderEmptyState("Noch keine offenen technischen Stoerungen geladen oder aktuell keine Treffer fuer die Filter.");
  }

  return `<section class="stack section">${state.openDisturbances.map(renderMonitoringPipelineItem).join("")}</section>`;
}

export function renderMonitoringPipelineItem(disturbance: MonitoringPipelineItem): string {
  const isSelected = state.selectedMonitoringDisturbanceId === disturbance.id;
  return `
    <article class="subcard stack compact ${disturbance.isCritical || disturbance.siteTechnicalStatus === "offline" ? "monitoring-critical" : ""} ${isSelected ? "is-selected-card" : ""}">
      ${renderSectionHeader(disturbance.title, {
        level: "h4",
        pills: [renderPriorityPill(disturbance.priority), renderPill(disturbance.status, `monitoring-status-${disturbance.status}`), ...(isSelected ? [renderPill("ausgewaehlt")] : [])]
      })}
      <p class="muted">${disturbance.customerName} | ${disturbance.siteName}${disturbance.deviceName ? ` | ${disturbance.deviceName}` : ""}${disturbance.checkTargetLabel ? ` | ${disturbance.checkTargetLabel}` : ""}</p>
      <dl class="facts compact-gap">
        <div><dt>Stoerung</dt><dd>${disturbance.disturbanceTypeLabel}</dd></div>
        <div><dt>Beginn</dt><dd>${formatTimestamp(disturbance.startedAt)}</dd></div>
        <div><dt>Dauer</dt><dd>${formatDuration(disturbance.durationSeconds)}</dd></div>
        <div><dt>Standortstatus</dt><dd>${disturbance.siteTechnicalStatus}</dd></div>
        <div><dt>Bezug</dt><dd>${disturbance.referenceLabel ?? disturbance.deviceName ?? "-"}</dd></div>
      </dl>
      ${disturbance.isCritical || disturbance.siteTechnicalStatus === "offline"
        ? renderNotice("Kritische oder Offline-nahe Stoerung.", "error", true)
        : ""}
      ${disturbance.lastNote ? `<p class="muted">Letzte Notiz: ${disturbance.lastNote}</p>` : ""}
      ${disturbance.serviceCaseId ? `<p class="muted">Servicefall: ${disturbance.serviceCaseStatus ?? "open"} (${disturbance.serviceCaseId})</p>` : ""}
      <div class="actions">
        <button type="button" class="secondary monitoring-detail-button" data-disturbance-id="${disturbance.id}">Technische Details</button>
        <button type="button" class="secondary monitoring-ack-button" data-disturbance-id="${disturbance.id}" ${disturbance.status === "acknowledged" ? "disabled" : ""}>Quittieren</button>
      </div>
    </article>
  `;
}

export function renderMonitoringDetailSection(): string {
  if (!state.selectedMonitoringDetail) {
    return renderEmptyState("Mit \"Technische Details\" kann eine Stoerung inklusive Historie und Notizen geladen werden.");
  }

  const { disturbance, site, device, checkTarget, history, notes } = state.selectedMonitoringDetail;
  const sitePlanWorkspace = renderSitePlanWorkspace(site.id, "monitoring");
  return `
    <section class="stack section">
      ${renderSectionHeader("Technische Detailsicht", {
        subtitle: "Historie, Notizen, technischer Bezug und Servicekontext bleiben in einer gemeinsamen Stoerungsansicht gebuendelt."
      })}
      <article class="subcard stack ${disturbance.priority === "critical" || site.technicalStatus === "offline" ? "monitoring-critical" : ""}">
        ${renderSectionHeader(disturbance.title, {
          level: "h4",
          pills: [
            renderPriorityPill(disturbance.priority),
            renderPill(disturbance.status, `monitoring-status-${disturbance.status}`),
            renderPill(site.technicalStatus, `monitoring-site-${site.technicalStatus}`)
          ]
        })}
        <p class="muted">${site.customerName} | ${site.siteName}${device ? ` | ${device.name}` : ""}</p>
        <section class="detail-grid">
          <article class="subcard stack compact">
            <h4>Grunddaten</h4>
            <dl class="facts compact-gap">
              <div><dt>Stoerungstyp</dt><dd>${disturbance.disturbanceTypeLabel}</dd></div>
              <div><dt>Beginn</dt><dd>${formatTimestamp(disturbance.startedAt)}</dd></div>
              <div><dt>Dauer</dt><dd>${formatDuration(disturbance.durationSeconds ?? 0)}</dd></div>
              <div><dt>Status</dt><dd>${disturbance.status}</dd></div>
              <div><dt>Standortstatus</dt><dd>${site.technicalStatus}</dd></div>
              <div><dt>Bezug</dt><dd>${disturbance.referenceLabel ?? device?.name ?? "-"}</dd></div>
            </dl>
            ${disturbance.description ? `<p>${disturbance.description}</p>` : ""}
            ${disturbance.comment ? `<p class="muted">Kommentar: ${disturbance.comment}</p>` : ""}
          </article>
          <article class="subcard stack compact">
            <h4>Technischer Bezug</h4>
            <dl class="facts compact-gap">
              <div><dt>Standort</dt><dd>${site.siteName}</dd></div>
              <div><dt>Kunde</dt><dd>${site.customerName}</dd></div>
              <div><dt>Standortstatus seit</dt><dd>${formatTimestamp(site.technicalStatusUpdatedAt)}</dd></div>
              <div><dt>Geraet</dt><dd>${device ? `${device.name} (${device.type})` : "-"}</dd></div>
              <div><dt>Check-Target</dt><dd>${checkTarget ? `${checkTarget.label} | ${checkTarget.checkKind}` : "-"}</dd></div>
            </dl>
          </article>
          <article class="subcard stack compact">
            <h4>Schnellaktionen</h4>
            <div class="actions">
              <button type="button" id="monitoring-detail-refresh-button" class="secondary">Neu laden</button>
              <button type="button" id="monitoring-ack-button" class="secondary" ${disturbance.status === "acknowledged" ? "disabled" : ""}>Stoerung quittieren</button>
            </div>
            <form id="monitoring-note-form" class="stack compact" data-ui-form-scope="monitoring-detail:${disturbance.id}" data-ui-preserve-form="true">
              <label class="field"><span>Notiz</span><input name="note" placeholder="Technische Beobachtung oder Handnotiz" required /></label>
              <button type="submit" ${disturbance.status === "resolved" ? "disabled" : ""}>Notiz speichern</button>
            </form>
          </article>
          <article class="subcard stack compact">
            <h4>Servicefall</h4>
            ${state.selectedMonitoringDetail.serviceCase
              ? `
                <dl class="facts compact-gap">
                  <div><dt>Status</dt><dd>${state.selectedMonitoringDetail.serviceCase.status}</dd></div>
                  <div><dt>Angelegt</dt><dd>${formatTimestamp(state.selectedMonitoringDetail.serviceCase.createdAt)}</dd></div>
                  <div><dt>Von</dt><dd>${state.selectedMonitoringDetail.serviceCase.createdByUserId}</dd></div>
                </dl>
                <p>${state.selectedMonitoringDetail.serviceCase.comment}</p>
              `
              : `
                <p class="muted">Wenn die Stoerung nicht behebbar ist, kann hier ein Servicefall erzeugt werden.</p>
                <form id="monitoring-service-case-form" class="stack compact" data-ui-form-scope="monitoring-detail:${disturbance.id}" data-ui-preserve-form="true">
                  <label class="field"><span>Begruendung / Kommentar</span><input name="comment" placeholder="Warum an Service uebergeben?" required /></label>
                  <button type="submit">Servicefall anlegen</button>
                </form>
              `}
          </article>
        </section>
        <section class="detail-grid">
          <article class="subcard stack compact">
            <h4>Historie</h4>
            ${history.length > 0
              ? `<ul class="plain-list">${history.map((event) => `<li>${formatTimestamp(event.createdAt)} | ${event.eventKind}${event.status ? ` | ${event.status}` : ""}${event.message ? ` | ${event.message}` : ""}${event.note ? `<br/>${event.note}` : ""}</li>`).join("")}</ul>`
              : renderEmptyState("Noch keine Historieneintraege vorhanden.")}
          </article>
          <article class="subcard stack compact">
            <h4>Notizen</h4>
            ${notes.length > 0
              ? `<ul class="plain-list">${notes.map((event) => `<li>${formatTimestamp(event.createdAt)}${event.actorUserId ? ` | ${event.actorUserId}` : ""}<br/>${event.note ?? event.message ?? ""}</li>`).join("")}</ul>`
              : renderEmptyState("Noch keine Notizen vorhanden.")}
          </article>
        </section>
        ${sitePlanWorkspace ? `
          <section class="detail-grid">
            <article class="subcard stack compact plan-detail-card">
              <h4>Objekt- / Kameraplan</h4>
              ${sitePlanWorkspace}
            </article>
          </section>
        ` : ""}
      </article>
    </section>
  `;
}
