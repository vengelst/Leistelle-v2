import { state } from "../state.js";
import { escapeHtml, formatTimestamp } from "../utils.js";
import { canAccessArchiveWorkspace } from "./auth.js";
import {
  renderArchiveAlarmTypeOptions,
  renderArchiveAssessmentOptions,
  renderArchiveCameraOptions,
  renderArchiveClosureReasonOptions,
  renderArchiveCustomerOptions,
  renderArchiveDisturbanceTypeOptions,
  renderArchiveLifecycleScopeOptions,
  renderArchivePeriodOptions,
  renderArchiveSiteOptions,
  renderDurationFacts,
  renderEmptyState,
  renderNotice,
  renderPill,
  renderReportingAlarmTypeOptions,
  renderReportingCameraOptions,
  renderReportingCustomerOptions,
  renderReportingDisturbanceTypeOptions,
  renderReportingGroupOptions,
  renderReportingGroups,
  renderReportingMetricFacts,
  renderReportingPeriodOptions,
  renderReportingSiteOptions,
  renderSectionHeader
} from "./common.js";

export function renderReportingSection(): string {
  if (!state.session) {
    return renderEmptyState("Nach dem Login steht die Reporting-Uebersicht mit Zeitraeumen und Filtern bereit.");
  }

  const reporting = state.reporting;
  return `
    <section class="stack">
      <form id="reporting-filter-form" class="subcard stack" data-ui-preserve-form="true">
        <div class="actions">
          <button type="submit" class="secondary">Reporting laden</button>
          <button type="button" id="reporting-reset-button" class="secondary">Filter zuruecksetzen</button>
          <button type="button" id="reporting-export-button" class="secondary" ${reporting ? "" : "disabled"}>Reporting als CSV exportieren</button>
        </div>
        <div class="detail-grid">
          <label class="field"><span>Zeitraum</span><select name="period">${renderReportingPeriodOptions()}</select></label>
          <label class="field"><span>Von</span><input name="dateFrom" type="date" value="${escapeHtml(state.reportingFilter.dateFrom ?? "")}" /></label>
          <label class="field"><span>Bis</span><input name="dateTo" type="date" value="${escapeHtml(state.reportingFilter.dateTo ?? "")}" /></label>
          <label class="field"><span>Gruppierung</span><select name="groupBy">${renderReportingGroupOptions()}</select></label>
          <label class="field"><span>Kunde</span><select name="customerId">${renderReportingCustomerOptions()}</select></label>
          <label class="field"><span>Standort</span><select name="siteId">${renderReportingSiteOptions()}</select></label>
          <label class="field"><span>Kamera</span><select name="cameraId">${renderReportingCameraOptions()}</select></label>
          <label class="field"><span>Alarmtyp</span><select name="alarmType">${renderReportingAlarmTypeOptions()}</select></label>
          <label class="field"><span>Stoerungstyp</span><select name="disturbanceType">${renderReportingDisturbanceTypeOptions()}</select></label>
          <label class="field"><span>Operator</span><input name="operatorUserId" value="${escapeHtml(state.reportingFilter.operatorUserId ?? "")}" placeholder="z. B. user-operator" /></label>
        </div>
      </form>
      ${reporting
        ? `
          <article class="subcard stack compact">
            ${renderSectionHeader("Auswertungszeitraum", {
              pills: [renderPill(reporting.range.period)]
            })}
            <p class="muted">${reporting.range.label}</p>
            <p class="muted">Die operative Auswertung nutzt bestehende Alarm-, Stoerungs- und Verlaufsdaten. Der CSV-Export spiegelt genau die aktuell geladene Filterung.</p>
          </article>
          <section class="detail-grid">
            <article class="subcard stack compact">
              <h3>Alarm-Reporting</h3>
              <dl class="facts compact-gap">
                ${renderReportingMetricFacts([
                  reporting.alarms.counts.totalAlarms,
                  reporting.alarms.counts.confirmedIncidents,
                  reporting.alarms.counts.falsePositives,
                  reporting.alarms.counts.policeCalls,
                  reporting.alarms.counts.securityServiceCalls,
                  reporting.alarms.counts.customerContacts
                ])}
              </dl>
              ${renderDurationFacts([
                reporting.alarms.durations.timeToAcceptance,
                reporting.alarms.durations.timeToProcessingStart,
                reporting.alarms.durations.timeToClosure,
                reporting.alarms.durations.openAlarmDuration
              ])}
              ${renderReportingGroups("Alarm-Gruppen", reporting.alarms.groups)}
            </article>
            <article class="subcard stack compact">
              <h3>Stoerungs-Reporting</h3>
              <dl class="facts compact-gap">
                ${renderReportingMetricFacts([
                  reporting.monitoring.counts.totalDisturbances,
                  reporting.monitoring.counts.openCriticalDisturbances
                ])}
              </dl>
              ${renderDurationFacts([reporting.monitoring.durations.openDisturbanceDuration])}
              ${renderReportingGroups("Stoerungs-Gruppen", reporting.monitoring.groups)}
            </article>
          </section>
        `
        : renderEmptyState("Noch keine Reporting-Auswertung geladen.")}
    </section>
  `;
}

export function renderArchiveSection(): string {
  if (!state.session) {
    return renderEmptyState("Nach dem Login steht die filterbare Archivsicht fuer abgeschlossene und archivierte Alarmfaelle bereit.");
  }

  if (!canAccessArchiveWorkspace()) {
    return renderNotice(
      "Archivierte Alarmfaelle sind nur fuer Administration, Leitstellenleitung und Operatoren in einer bewussten Archivsicht verfuegbar.",
      "default",
      true
    );
  }

  return `
    <section class="stack">
      <form id="archive-filter-form" class="subcard stack" data-ui-preserve-form="true">
        <div class="actions">
          <button type="submit" class="secondary">Archiv laden</button>
          <button type="button" id="archive-reset-button" class="secondary">Filter zuruecksetzen</button>
          <button type="button" id="archive-export-button" class="secondary" ${state.archive ? "" : "disabled"}>Archivliste als CSV exportieren</button>
        </div>
        <div class="detail-grid">
          <label class="field"><span>Zeitraum</span><select name="period">${renderArchivePeriodOptions()}</select></label>
          <label class="field"><span>Von</span><input name="dateFrom" type="date" value="${escapeHtml(state.archiveFilter.dateFrom ?? "")}" /></label>
          <label class="field"><span>Bis</span><input name="dateTo" type="date" value="${escapeHtml(state.archiveFilter.dateTo ?? "")}" /></label>
          <label class="field"><span>Statusbereich</span><select name="lifecycleScope">${renderArchiveLifecycleScopeOptions()}</select></label>
          <label class="field"><span>Kunde</span><select name="customerId">${renderArchiveCustomerOptions()}</select></label>
          <label class="field"><span>Standort</span><select name="siteId">${renderArchiveSiteOptions()}</select></label>
          <label class="field"><span>Kamera</span><select name="cameraId">${renderArchiveCameraOptions()}</select></label>
          <label class="field"><span>Alarmtyp</span><select name="alarmType">${renderArchiveAlarmTypeOptions()}</select></label>
          <label class="field"><span>Bewertung</span><select name="assessmentStatus">${renderArchiveAssessmentOptions()}</select></label>
          <label class="field"><span>Abschlussgrund</span><select name="closureReasonId">${renderArchiveClosureReasonOptions()}</select></label>
          <label class="field"><span>Stoerungstyp</span><select name="disturbanceType">${renderArchiveDisturbanceTypeOptions()}</select></label>
          <label class="field"><span>Bearbeiter</span><input name="operatorUserId" value="${escapeHtml(state.archiveFilter.operatorUserId ?? "")}" placeholder="z. B. user-operator" /></label>
        </div>
      </form>
      <article class="subcard stack compact">
        <h4>Bewusste Archivsicht</h4>
        <p class="muted">Archivdaten bleiben aus dem operativen Standardblick herausgenommen und werden nur ueber diese gefilterte Archivsicht geladen.</p>
      </article>
      ${renderArchiveList()}
    </section>
  `;
}

export function renderArchiveList(): string {
  const archive = state.archive;
  if (!archive) {
    return renderEmptyState("Noch keine Archivdaten geladen.");
  }

  if (archive.items.length === 0) {
    return renderEmptyState("Keine Alarmfaelle fuer die aktuelle Archivfilterung gefunden.");
  }

  return `
    <section class="stack section">
      <article class="subcard stack compact">
        <h4>Historische Nachvollziehbarkeit</h4>
        <p class="muted">Archivdetail oeffnen nutzt den bestehenden Alarm-Detailpfad mit Fallbericht, Kommentaren, Massnahmen, Historie und den bekannten Einzelfall-Exporten.</p>
      </article>
      ${archive.items.map((item) => `
        <article class="subcard stack compact archive-item">
          ${renderSectionHeader(item.title, {
            level: "h4",
            pills: [renderPill(item.priority, `priority-${item.priority}`), renderPill(item.lifecycleStatus)]
          })}
          <p class="muted">${item.customerName} | ${item.siteName}${item.primaryDeviceName ? ` | ${item.primaryDeviceName}` : ""}</p>
          <dl class="facts compact-gap">
            <div><dt>Alarmtyp</dt><dd>${item.alarmType}</dd></div>
            <div><dt>Bewertung</dt><dd>${item.assessmentStatus}</dd></div>
            <div><dt>Eingang</dt><dd>${formatTimestamp(item.receivedAt)}</dd></div>
            <div><dt>Abschluss</dt><dd>${item.resolvedAt ? formatTimestamp(item.resolvedAt) : "-"}</dd></div>
            <div><dt>Archiviert</dt><dd>${item.archivedAt ? formatTimestamp(item.archivedAt) : "-"}</dd></div>
            <div><dt>Abschlussgrund</dt><dd>${item.closureReasonLabel ?? "-"}</dd></div>
            <div><dt>Events / Medien</dt><dd>${item.eventCount} / ${item.mediaCount}</dd></div>
            <div><dt>Archiviert von</dt><dd>${item.archivedByDisplayName ?? item.archivedByUserId ?? "-"}</dd></div>
          </dl>
          <div class="actions">
            <button type="button" class="secondary archive-open-button" data-alarm-case-id="${item.id}">Archivdetail oeffnen</button>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}
