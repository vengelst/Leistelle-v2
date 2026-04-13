import type { AlarmCaseDetail, AlarmPipelineItem } from "@leitstelle/contracts";

import { state } from "../state.js";
import { escapeHtml, formatDateTimeLocalValue, formatTimestamp } from "../utils.js";
import {
  applyClientSidePipelineFilter,
  formatActiveAssignmentSummary,
  formatAlarmAssessmentLabel,
  formatAlarmLifecycleLabel,
  formatAlarmResponseDeadlineStateLabel,
  formatAlarmTechnicalStateLabel,
  formatAlarmTypeLabel,
  formatFollowUpValue,
  formatResponseDueAtValue,
  formatRelativeAge,
  isOverdueFollowUp,
  renderActiveFollowUpNotice,
  renderAlarmAssignmentStatePill,
  renderAlarmAssignmentStatusNotice,
  renderAlarmActionLog,
  renderAlarmActionPanel,
  renderAlarmCommentLog,
  renderAlarmEventTimeline,
  renderAlarmAssignmentTransferForm,
  renderEmptyState,
  renderPipelineAssignmentQuickFilters,
  resolveActiveAssignmentDisplay,
  renderAlarmAssessmentPill,
  renderAlarmLifecyclePill,
  renderAlarmTechnicalStatePill,
  renderCatalogOptions,
  renderInstructionProfile,
  renderNotice,
  renderOptions,
  renderPipelineAssignmentScopeOptions,
  renderPipelineLifecycleOptions,
  renderPipelineSiteOptions,
  renderPriorityPill,
  renderSectionHeader,
  renderPipelineTechnicalOptions,
  renderPill,
  renderResponseDeadlineNotice,
  renderSitePlanWorkspace
} from "./common.js";
import { renderAlarmMediaSection } from "./alarm-media.js";

export function renderPipelineSection(): string {
  if (!state.session) return renderEmptyState("Nach dem Login kann die Pipeline offener Alarme geladen werden.");
  return `
    ${renderPipelineFilterForm()}
    ${renderPipelineList()}
    ${renderAlarmDetailSection()}
  `;
}

export function renderPipelineFilterForm(): string {
  return `
    <form id="pipeline-filter-form" class="subcard stack" data-ui-preserve-form="true">
      ${renderPipelineAssignmentQuickFilters()}
      <div class="actions">
        <button type="submit" class="secondary">Pipeline laden</button>
        <button type="button" id="pipeline-reset-button" class="secondary">Filter zuruecksetzen</button>
      </div>
      <div class="pipeline-filter-row">
        <label class="field"><span>Standortfilter</span><select name="siteId">${renderPipelineSiteOptions()}</select></label>
        <label class="field"><span>Technischer Status</span><select name="technicalState">${renderPipelineTechnicalOptions()}</select></label>
        <label class="field"><span>Bearbeitungsstatus</span><select name="lifecycleScope">${renderPipelineLifecycleOptions()}</select></label>
        <label class="field"><span>Zuweisung</span><select name="assignmentScope">${renderPipelineAssignmentScopeOptions()}</select></label>
      </div>
    </form>
  `;
}

export function renderPipelineList(): string {
  const filtered = applyClientSidePipelineFilter(state.openAlarms);
  if (state.openAlarms.length === 0) return renderEmptyState("Noch keine offenen Alarme geladen oder aktuell keine Treffer fuer die Filter.");
  if (filtered.length === 0) return renderEmptyState(`Keine Treffer fuer den aktiven Filter (${state.openAlarms.length} offene Alarme insgesamt).`);
  return `<section class="stack section">${filtered.map(renderPipelineItem).join("")}</section>`;
}

export function renderPipelineItem(alarm: AlarmPipelineItem): string {
  const currentUserId = state.session?.user.id;
  const isMine = alarm.activeAssignment?.userId === currentUserId;
  const canOverride = state.session?.user.roles.some((role) => role === "administrator" || role === "leitstellenleiter") ?? false;
  const canTakeOver = !alarm.activeAssignment || (canOverride && !isMine);
  const isSelected = state.selectedAlarmCaseId === alarm.id;
  const age = formatRelativeAge(alarm.receivedAt);
  const hasFollowUp = Boolean(alarm.followUpAt);
  const isFollowUpOverdue = isOverdueFollowUp(alarm.followUpAt);
  const responseNotice = renderResponseDeadlineNotice(alarm);
  return `
    <article class="subcard stack compact ${isSelected ? "is-selected-card" : ""}">
      ${renderSectionHeader(alarm.title, {
        level: "h4",
        pills: [
          renderPriorityPill(alarm.priority),
          renderAlarmLifecyclePill(alarm.lifecycleStatus),
          renderAlarmAssessmentPill(alarm.assessmentStatus),
          renderPill(`${age}`, "alarm-age"),
          renderAlarmAssignmentStatePill(alarm.activeAssignment),
          ...(alarm.responseDeadlineState === "due_soon" ? [renderPill("Frist bald faellig")] : []),
          ...(alarm.isEscalationReady ? [renderPill("eskalationsreif")] : []),
          ...(hasFollowUp ? [renderPill(isFollowUpOverdue ? "WV ueberfaellig" : "Wiedervorlage")] : []),
          ...(isSelected ? [renderPill("ausgewaehlt")] : [])
        ]
      })}
      <p class="muted">${escapeHtml(alarm.customerName)} | ${escapeHtml(alarm.siteName)}</p>
      <dl class="facts compact-gap">
        <div><dt>Eingang</dt><dd>${formatTimestamp(alarm.receivedAt)}</dd></div>
        <div><dt>Letzte Aktivitaet</dt><dd>${formatTimestamp(alarm.lastEventAt)}</dd></div>
        <div><dt>Alarmtyp</dt><dd>${formatAlarmTypeLabel(alarm.alarmType)}</dd></div>
        <div><dt>Quelle</dt><dd>${escapeHtml(alarm.primaryDeviceName ?? "-")}</dd></div>
        <div><dt>Technik</dt><dd>${formatAlarmTechnicalStateLabel(alarm.technicalState)}</dd></div>
        <div><dt>Events / Medien</dt><dd>${alarm.eventCount} / ${alarm.mediaCount}</dd></div>
        <div><dt>Bearbeitung</dt><dd>${formatActiveAssignmentSummary(alarm.activeAssignment)}</dd></div>
        <div><dt>Reaktionsfrist</dt><dd>${formatResponseDueAtValue(alarm.responseDueAt)}</dd></div>
        <div><dt>Wiedervorlage</dt><dd>${formatFollowUpValue(alarm.followUpAt)}</dd></div>
      </dl>
      ${responseNotice}
      ${renderAlarmAssignmentStatusNotice(alarm.activeAssignment)}
      ${alarm.hasTechnicalIssue ? renderNotice(`Technischer Fehlerfall${alarm.incompleteReason ? `: ${alarm.incompleteReason}` : "."}`, "error", true) : ""}
      ${hasFollowUp ? renderNotice(isFollowUpOverdue ? `Wiedervorlage ueberfaellig seit ${formatTimestamp(alarm.followUpAt!)}` : `Wiedervorlage aktiv fuer ${formatTimestamp(alarm.followUpAt!)}`, isFollowUpOverdue ? "error" : "default", true) : ""}
      <div class="actions operator-primary-actions">
        <button
          type="button"
          class="detail-button operator-entry-button"
          data-operator-entry-button="true"
          data-alarm-case-id="${alarm.id}"
          aria-current="${isSelected ? "true" : "false"}"
        >Alarm oeffnen</button>
        <button type="button" class="secondary reserve-button" data-alarm-case-id="${alarm.id}" ${!canTakeOver ? "disabled" : ""}>${!alarm.activeAssignment ? "Uebernehmen" : canOverride && !isMine ? "Override uebernehmen" : isMine ? "Schon uebernommen" : "Belegt"}</button>
        <button type="button" class="secondary release-button" data-alarm-case-id="${alarm.id}" ${!alarm.activeAssignment || (!isMine && !canOverride) ? "disabled" : ""}>Freigeben</button>
      </div>
      <details class="operator-secondary-panel">
        <summary>Weitere Zuordnung</summary>
        ${renderAlarmAssignmentTransferForm(alarm.id, {
          disabled: !alarm.activeAssignment || (!isMine && !canOverride),
          canOverride,
          formScope: `alarm-assignment:${alarm.id}`,
          submitLabel: canOverride ? "Umhaengen / uebernehmen" : "Umhaengen",
          ...(alarm.activeAssignment?.userId ? { currentOwnerUserId: alarm.activeAssignment.userId } : {})
        })}
      </details>
    </article>
  `;
}

export function renderAlarmDetailSection(): string {
  if (!state.selectedAlarmDetail) return renderEmptyState("Mit \"Details / Anweisungen\" kann der Alarmkontext inklusive passender Einsatzanweisungen geladen werden.");
  const instructionContext = state.selectedAlarmDetail.instructionContext;
  const alarmCase = state.selectedAlarmDetail.alarmCase;
  const activeAssignmentDisplay = resolveActiveAssignmentDisplay(state.selectedAlarmDetail);
  const isWritable = !state.selectedAlarmDetail.isArchived;
  const falsePositiveReasonOptions = renderCatalogOptions(state.catalogs?.falsePositiveReasons ?? [], "Grund waehlen");
  const closureReasonOptions = renderCatalogOptions(state.catalogs?.closureReasons ?? [], "Abschlussgrund waehlen");
  const actionTypeOptions = renderCatalogOptions(state.catalogs?.actionTypes ?? [], "Massnahmeart waehlen");
  const actionStatusOptions = renderCatalogOptions(state.catalogs?.actionStatuses ?? [], "Status waehlen");
  const sitePlanWorkspace = renderSitePlanWorkspace(alarmCase.siteId, "alarm");
  return `
    <section class="stack section">
      ${renderSectionHeader("Alarmkontext", {
        subtitle: "Bewertung, Status, Massnahmen und Einsatzanweisungen laufen hier in einem gemeinsamen Fallkontext zusammen."
      })}
      <article class="subcard stack">
        ${renderSectionHeader(alarmCase.title, {
          level: "h4",
          pills: [
            renderPriorityPill(alarmCase.priority),
            renderAlarmLifecyclePill(alarmCase.lifecycleStatus),
            renderAlarmAssessmentPill(alarmCase.assessmentStatus),
            renderAlarmTechnicalStatePill(alarmCase.technicalState),
            renderAlarmAssignmentStatePill(activeAssignmentDisplay),
            renderPill(`Kontext ${instructionContext.timeContext}`)
          ]
        })}
        <p class="muted">${formatAlarmTypeLabel(alarmCase.alarmType)} | Standort ${instructionContext.siteId}${instructionContext.specialContextLabel ? ` | Sonderlage ${instructionContext.specialContextLabel}` : ""}</p>
        <nav class="operator-detail-jumpnav" aria-label="Alarmkontext Bereiche">
          <a class="button-link secondary" href="#alarm-detail-overview">Lagebild</a>
          <a class="button-link secondary" href="#alarm-detail-decision">Aktionen</a>
          <a class="button-link secondary" href="#alarm-detail-worklog">Dokumentation</a>
          <a class="button-link secondary" href="#alarm-detail-context">Kontext</a>
        </nav>
        <section class="detail-grid detail-grid-emphasis" id="alarm-detail-overview">
          <article class="subcard stack compact">
            <h4>Aktuelles Lagebild</h4>
            <dl class="facts compact-gap">
              <div><dt>Status</dt><dd>${formatAlarmLifecycleLabel(alarmCase.lifecycleStatus)}</dd></div>
              <div><dt>Bewertung</dt><dd>${formatAlarmAssessmentLabel(alarmCase.assessmentStatus)}</dd></div>
              <div><dt>Technik</dt><dd>${formatAlarmTechnicalStateLabel(alarmCase.technicalState)}</dd></div>
              <div><dt>Alarmtyp</dt><dd>${formatAlarmTypeLabel(alarmCase.alarmType)}</dd></div>
              <div><dt>Eingang</dt><dd>${formatTimestamp(alarmCase.receivedAt)}</dd></div>
              <div><dt>Alter</dt><dd>${formatRelativeAge(alarmCase.receivedAt)}</dd></div>
              <div><dt>Reaktionsfrist</dt><dd>${formatResponseDueAtValue(alarmCase.responseDueAt)}</dd></div>
              <div><dt>Friststatus</dt><dd>${formatAlarmResponseDeadlineStateLabel(alarmCase.responseDeadlineState)}</dd></div>
              <div><dt>Wiedervorlage</dt><dd>${formatFollowUpValue(alarmCase.followUpAt)}</dd></div>
              <div><dt>Abschluss</dt><dd>${alarmCase.resolvedAt ? formatTimestamp(alarmCase.resolvedAt) : "-"}</dd></div>
              <div><dt>Archivstatus</dt><dd>${state.selectedAlarmDetail.isArchived ? "archiviert" : "operativ"}</dd></div>
              <div><dt>Bearbeitung</dt><dd>${formatActiveAssignmentSummary(activeAssignmentDisplay)}</dd></div>
            </dl>
            ${renderResponseDeadlineNotice(alarmCase)}
            ${renderAlarmAssignmentStatusNotice(activeAssignmentDisplay)}
            ${renderActiveFollowUpNotice(alarmCase.followUpAt, alarmCase.followUpNote)}
          </article>
          <article
            class="subcard stack compact operator-focus-zone"
            id="alarm-detail-actions-zone"
            tabindex="-1"
            role="region"
            aria-label="Primaeraktionen fuer den Alarm"
            aria-keyshortcuts="Control+Shift+3"
            data-operator-focus-zone="actions"
          >
            <span id="alarm-detail-decision"></span>
            ${renderAlarmActionPanel(state.selectedAlarmDetail, { includeReport: true, includeExport: true })}
          </article>
        </section>
        <section class="detail-grid" id="alarm-detail-worklog">
          <article class="subcard stack compact">
            <h4>Bewertung</h4>
            <form id="assessment-form" class="stack compact" data-ui-form-scope="alarm-detail:${alarmCase.id}" data-ui-preserve-form="true">
              <label class="field"><span>Bewertung</span><select name="assessmentStatus">${renderOptions(["pending", "confirmed_incident", "false_positive"], alarmCase.assessmentStatus)}</select></label>
              <label class="field"><span>Fehlalarmgrund</span><select name="falsePositiveReasonId">${falsePositiveReasonOptions}</select></label>
              <button type="submit" ${!isWritable ? "disabled" : ""}>Bewertung speichern</button>
            </form>
          </article>
          <article class="subcard stack compact">
            <h4>Massnahme dokumentieren</h4>
            <form id="action-form" class="stack compact" data-ui-form-scope="alarm-detail:${alarmCase.id}" data-ui-preserve-form="true">
              <label class="field"><span>Massnahmeart</span><select name="actionTypeId">${actionTypeOptions}</select></label>
              <label class="field"><span>Status</span><select name="statusId">${actionStatusOptions}</select></label>
              <label class="field"><span>Kommentar</span><input name="comment" placeholder="z. B. Rueckmeldung dokumentieren" required /></label>
              <button type="submit" ${!isWritable ? "disabled" : ""}>Massnahme speichern</button>
            </form>
          </article>
          <article class="subcard stack compact">
            <h4>Kommentar</h4>
            <form id="comment-form" class="stack compact" data-ui-form-scope="alarm-detail:${alarmCase.id}" data-ui-preserve-form="true">
              <label class="field"><span>Notiz</span><input name="body" placeholder="Kurze Lage- oder Bearbeitungsnotiz" required /></label>
              <button type="submit" ${!isWritable ? "disabled" : ""}>Kommentar speichern</button>
            </form>
          </article>
          <article class="subcard stack compact">
            <h4>Abschluss</h4>
            <form id="close-form" class="stack compact" data-ui-form-scope="alarm-detail:${alarmCase.id}" data-ui-preserve-form="true">
              <label class="field"><span>Abschlussgrund</span><select name="closureReasonId">${closureReasonOptions}</select></label>
              <label class="field"><span>Kommentar optional</span><input name="comment" placeholder="Abschlussnotiz" /></label>
              <button type="submit" ${!isWritable || alarmCase.lifecycleStatus === "resolved" || alarmCase.lifecycleStatus === "archived" ? "disabled" : ""}>Fall schliessen</button>
            </form>
          </article>
          <article class="subcard stack compact">
            <h4>Wiedervorlage</h4>
            <form id="follow-up-form" class="stack compact" data-ui-form-scope="alarm-follow-up:${alarmCase.id}" data-ui-preserve-form="true">
              <label class="field"><span>Zeitpunkt</span><input name="followUpAt" type="datetime-local" required value="${escapeHtml(formatDateTimeLocalValue(alarmCase.followUpAt))}" /></label>
              <label class="field"><span>Notiz optional</span><input name="note" placeholder="z. B. Rueckruf pruefen" value="${escapeHtml(alarmCase.followUpNote ?? "")}" /></label>
              <div class="actions">
                <button type="submit" ${!isWritable || alarmCase.lifecycleStatus === "resolved" || alarmCase.lifecycleStatus === "archived" ? "disabled" : ""}>${alarmCase.followUpAt ? "Wiedervorlage aktualisieren" : "Wiedervorlage setzen"}</button>
                <button type="button" id="follow-up-clear-button" class="secondary" ${!isWritable || !alarmCase.followUpAt ? "disabled" : ""}>Wiedervorlage entfernen</button>
              </div>
            </form>
          </article>
        </section>
        <section class="detail-grid" id="alarm-detail-context">
          <article class="subcard stack compact">
            <h4>Massnahmen</h4>
            ${renderAlarmActionLog(state.selectedAlarmDetail)}
          </article>
          <article class="subcard stack compact">
            <h4>Einsatzanweisungen</h4>
            <label class="field">
              <span>Zeitkontext fuer Anweisungen</span>
              <select id="detail-time-context">${renderOptions(["normal", "weekend", "special"], state.selectedInstructionTimeContext ?? instructionContext.timeContext)}</select>
            </label>
            ${instructionContext.profiles.length > 0 ? instructionContext.profiles.map(renderInstructionProfile).join("") : renderEmptyState("Keine Einsatzanweisungen fuer diesen Kontext hinterlegt.")}
          </article>
          ${renderAlarmSourceContextCard(alarmCase)}
        </section>
        ${sitePlanWorkspace ? `
          <section class="detail-grid">
            <article class="subcard stack compact plan-detail-card">
              <h4>Objekt- / Kameraplan</h4>
              ${sitePlanWorkspace}
            </article>
          </section>
        ` : ""}
        <section class="detail-grid">
          <article class="subcard stack compact">
            <h4>Kommentare</h4>
            ${renderAlarmCommentLog(state.selectedAlarmDetail)}
          </article>
          <article class="subcard stack compact">
            <h4>Fallakte</h4>
            ${renderAlarmEventTimeline(state.selectedAlarmDetail)}
          </article>
        </section>
        <section class="detail-grid">
          ${renderAlarmMediaSection(state.selectedAlarmDetail, { maxPreviewCount: 3 })}
        </section>
        ${renderAlarmReportSection()}
      </article>
    </section>
  `;
}

function renderAlarmSourceContextCard(alarmCase: AlarmCaseDetail["alarmCase"]): string {
  return `
    <article class="subcard stack compact">
      <h4>Quelle / Eingang</h4>
      <dl class="facts compact-gap">
        <div><dt>Quellzeit</dt><dd>${alarmCase.sourceOccurredAt ? formatTimestamp(alarmCase.sourceOccurredAt) : "-"}</dd></div>
        <div><dt>Externe Referenz</dt><dd>${escapeHtml(alarmCase.externalSourceRef ?? "-")}</dd></div>
        <div><dt>Primaergeraet</dt><dd>${escapeHtml(alarmCase.primaryDeviceId ?? "-")}</dd></div>
      </dl>
      ${alarmCase.description ? `<p>${escapeHtml(alarmCase.description)}</p>` : `<p class="muted">Keine Freitextbeschreibung fuer den Eingang vorhanden.</p>`}
      ${renderAlarmPayloadDetails("Rohdaten", alarmCase.sourcePayload)}
      ${renderAlarmPayloadDetails("Technische Details", alarmCase.technicalDetails)}
    </article>
  `;
}

function renderAlarmPayloadDetails(label: string, payload: Record<string, unknown> | undefined): string {
  if (!payload || Object.keys(payload).length === 0) {
    return "";
  }

  return `
    <details class="operator-secondary-panel">
      <summary>${escapeHtml(label)}</summary>
      <pre class="code-block">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
    </details>
  `;
}

export function renderAlarmReportSection(): string {
  if (!state.selectedAlarmDetail) {
    return "";
  }

  if (!state.selectedAlarmReport || state.selectedAlarmReport.alarmCase.id !== state.selectedAlarmDetail.alarmCase.id) {
    return `
      <section class="detail-grid">
        <article class="subcard stack compact">
          <h4>Fallbericht</h4>
          ${renderEmptyState("Der Fallbericht kann direkt aus dem Alarmkontext geladen oder exportiert werden.")}
        </article>
      </section>
    `;
  }

  const report = state.selectedAlarmReport;
  return `
    <section class="detail-grid">
      <article class="subcard stack compact">
        ${renderSectionHeader("Fallbericht", {
          level: "h4",
          pills: [renderPill(report.isArchived ? "archiviert" : "operativ")]
        })}
        <p class="muted">Erzeugt am ${formatTimestamp(report.generatedAt)} von ${report.generatedBy.displayName}</p>
        <dl class="facts compact-gap">
          <div><dt>Standort</dt><dd>${report.site.siteName}</dd></div>
          <div><dt>Kunde</dt><dd>${report.site.customerName}</dd></div>
          <div><dt>Primaergeraet</dt><dd>${report.primaryDevice ? `${report.primaryDevice.name} (${report.primaryDevice.type})` : "-"}</dd></div>
          <div><dt>Bearbeiter</dt><dd>${report.actors.length}</dd></div>
          <div><dt>Medienverweise</dt><dd>${report.media.length}</dd></div>
          <div><dt>Abschluss</dt><dd>${report.closureReason?.label ?? "-"}</dd></div>
        </dl>
      </article>
      <article class="subcard stack compact">
        <h4>Berichtsnarrativ</h4>
        <ul class="plain-list">
          ${[...report.narrative.overview, ...report.narrative.progress, ...report.narrative.actions, ...report.narrative.completion].map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}
        </ul>
      </article>
    </section>
  `;
}

