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
  renderCatalogOptions,
  renderAlarmAssessmentPill,
  renderAlarmLifecyclePill,
  renderAlarmTechnicalStatePill,
  renderEmptyState,
  renderInstructionProfile,
  renderNotice,
  renderOptions,
  renderPipelineAssignmentQuickFilters,
  renderPill,
  renderPriorityPill,
  renderResponseDeadlineNotice,
  resolveActiveAssignmentDisplay,
  renderSectionHeader,
  renderSitePlanWorkspace
} from "./common.js";
import { renderAlarmMediaSection } from "./alarm-media.js";

export function renderOperatorScreen(): string {
  if (!state.session) {
    return renderEmptyState("Nach dem Login steht der dedizierte Alarmannahme-Screen fuer die Leitstelle bereit.");
  }

  return `
    <section class="operator-screen-layout" data-operator-keyboard-root="true">
      <aside class="operator-screen-queue-column">
        <article
          class="subcard stack compact operator-screen-queue-card operator-focus-zone"
          id="operator-list-zone"
          tabindex="-1"
          role="region"
          aria-label="Alarmannahme Warteschlange"
          aria-keyshortcuts="Control+Shift+1 Control+Shift+ArrowDown Control+Shift+ArrowUp"
          data-operator-focus-zone="list"
        >
          ${renderSectionHeader("Alarmannahme", {
            subtitle: "Die Warteschlange nutzt die bestehende Pipeline-Sortierung als operative FIFO-nahe Arbeitsliste. Uebernehmen nutzt unveraendert die vorhandene Reservierungslogik.",
            pills: [renderPill(`${state.openAlarms.length} offen`), ...(state.pendingOperations["open-alarms"] ? [renderPill("laedt")] : [])]
          })}
          <p class="muted operator-shortcut-hint">Tastatur: Strg+Umschalt+1/2/3 fuer Liste, Detail und Aktionen, Strg+Umschalt+Pfeil hoch/runter fuer die Warteschlange, Strg+Umschalt+Eingabe zum Oeffnen, Strg+Umschalt+R zum Uebernehmen, Strg+Umschalt+Q zum Quittieren, Strg+Umschalt+E fuer Sicherheitsdienst, Strg+Umschalt+F fuer Filter und Esc zurueck zur Liste.</p>
          <div class="actions">
            <button type="button" id="pipeline-reset-button" class="secondary">Filter zuruecksetzen</button>
            <a class="button-link secondary" href="#leitstelle/operator" target="_blank" rel="noopener noreferrer">Im separaten Tab</a>
          </div>
          <div class="operator-screen-queue-panel" data-ui-preserve-scroll="operator-screen-queue">
            ${renderOperatorQueue()}
          </div>
        </article>
      </aside>
      <section class="operator-screen-context-column">
        ${renderOperatorContext()}
      </section>
    </section>
  `;
}

function renderOperatorQueue(): string {
  const filteredAlarms = applyClientSidePipelineFilter(state.openAlarms);
  if (filteredAlarms.length === 0) {
    return renderEmptyState(state.openAlarms.length === 0 ? "Aktuell liegen keine offenen Alarme in der Annahme-Warteschlange." : "Fuer den aktuellen Zuweisungsfilter sind hier keine offenen Alarme sichtbar.");
  }

  const currentUserId = state.session?.user.id;
  const canOverride = state.session?.user.roles.some((role) => role === "administrator" || role === "leitstellenleiter") ?? false;
  return `
    <section class="stack section">
      ${renderPipelineAssignmentQuickFilters()}
      ${filteredAlarms.map((alarm, index) => {
        const isSelected = state.selectedAlarmCaseId === alarm.id;
        const isMine = alarm.activeAssignment?.userId === currentUserId;
        const isTaken = Boolean(alarm.activeAssignment && !isMine);
        const canTakeOver = !alarm.activeAssignment || (canOverride && !isMine);
        const age = formatRelativeAge(alarm.receivedAt);
        const hasFollowUp = Boolean(alarm.followUpAt);
        const isFollowUpOverdue = isOverdueFollowUp(alarm.followUpAt);
        const responseNotice = renderResponseDeadlineNotice(alarm);
        return `
          <article class="subcard stack compact operator-queue-item${isSelected ? " is-selected-card" : ""}">
            ${renderSectionHeader(alarm.title, {
              level: "h4",
              pills: [
                renderPill(`Pos ${index + 1}`),
                renderPriorityPill(alarm.priority),
                renderAlarmLifecyclePill(alarm.lifecycleStatus),
                renderPill(`${age}`, "alarm-age"),
                renderAlarmAssignmentStatePill(alarm.activeAssignment),
                ...(alarm.responseDeadlineState === "due_soon" ? [renderPill("Frist bald faellig")] : []),
                ...(alarm.isEscalationReady ? [renderPill("eskalationsreif")] : []),
                ...(hasFollowUp ? [renderPill(isFollowUpOverdue ? "WV ueberfaellig" : "Wiedervorlage")] : []),
                ...(isMine ? [renderPill("mein Alarm")] : isTaken ? [renderPill("anderer Bearbeiter")] : [renderPill("frei")] )
              ],
              actions: `<button type="button" class="secondary operator-accept-button operator-entry-button" data-operator-entry-button="true" data-alarm-case-id="${alarm.id}" aria-current="${isSelected ? "true" : "false"}" ${!canTakeOver ? "disabled" : ""}>${isMine ? "Kontext oeffnen" : canOverride && isTaken ? "Override uebernehmen" : "Uebernehmen"}</button>`
            })}
            <dl class="facts compact-gap">
              <div><dt>Alarmtyp</dt><dd>${formatAlarmTypeLabel(alarm.alarmType)}</dd></div>
              <div><dt>Alarmzeit</dt><dd>${formatTimestamp(alarm.receivedAt)}</dd></div>
              <div><dt>Standort</dt><dd>${escapeHtml(alarm.siteName)}</dd></div>
              <div><dt>Kunde</dt><dd>${escapeHtml(alarm.customerName)}</dd></div>
              <div><dt>Quelle</dt><dd>${escapeHtml(alarm.primaryDeviceName ?? "-")}</dd></div>
              <div><dt>Bewertung</dt><dd>${formatAlarmAssessmentLabel(alarm.assessmentStatus)}</dd></div>
              <div><dt>Technik</dt><dd>${formatAlarmTechnicalStateLabel(alarm.technicalState)}</dd></div>
              <div><dt>Medien</dt><dd>${alarm.mediaCount}</dd></div>
              <div><dt>Reaktionsfrist</dt><dd>${formatResponseDueAtValue(alarm.responseDueAt)}</dd></div>
              <div><dt>Wiedervorlage</dt><dd>${formatFollowUpValue(alarm.followUpAt)}</dd></div>
            </dl>
            <p class="muted">Bearbeitung: ${escapeHtml(formatActiveAssignmentSummary(alarm.activeAssignment))}.</p>
            ${renderAlarmAssignmentStatusNotice(alarm.activeAssignment)}
            ${responseNotice}
            ${hasFollowUp ? renderNotice(isFollowUpOverdue ? `Wiedervorlage ueberfaellig seit ${formatTimestamp(alarm.followUpAt!)}` : `Wiedervorlage aktiv fuer ${formatTimestamp(alarm.followUpAt!)}`, isFollowUpOverdue ? "error" : "default", true) : ""}
            ${alarm.hasTechnicalIssue ? renderNotice(`Technischer Hinweis: ${alarm.incompleteReason ?? "unvollstaendiger Eingang"}`, "error", true) : ""}
          </article>
        `;
      }).join("")}
    </section>
  `;
}

function renderOperatorContext(): string {
  if (!state.selectedAlarmDetail) {
    return `
      <article
        class="subcard stack compact operator-screen-placeholder operator-focus-zone"
        id="operator-detail-zone"
        tabindex="-1"
        role="region"
        aria-label="Operativer Bearbeitungskontext"
        aria-keyshortcuts="Control+Shift+2"
        data-operator-focus-zone="detail"
      >
        ${renderSectionHeader("Operativer Bearbeitungskontext", {
          pills: [renderPill("Auswahl offen")]
        })}
        <p class="muted">Links einen Alarm uebernehmen oder erneut oeffnen. Danach werden hier Medienbezug, Lageplan, Massnahmen, Kommentare und die laufende Bearbeitung konzentriert dargestellt.</p>
      </article>
    `;
  }

  const detail = state.selectedAlarmDetail;
  const alarmCase = detail.alarmCase;
  const activeAssignmentDisplay = resolveActiveAssignmentDisplay(detail);
  const isWritable = !detail.isArchived;
  const falsePositiveReasonOptions = renderCatalogOptions(state.catalogs?.falsePositiveReasons ?? [], "Grund waehlen");
  const closureReasonOptions = renderCatalogOptions(state.catalogs?.closureReasons ?? [], "Abschlussgrund waehlen");
  const actionTypeOptions = renderCatalogOptions(state.catalogs?.actionTypes ?? [], "Massnahmeart waehlen");
  const actionStatusOptions = renderCatalogOptions(state.catalogs?.actionStatuses ?? [], "Status waehlen");
  const planWorkspace = renderSitePlanWorkspace(alarmCase.siteId, "alarm");
  const site = state.overview?.sites.find((entry) => entry.id === alarmCase.siteId);

  return `
    <section class="stack operator-screen-context">
      <article
        class="subcard stack operator-focus-zone"
        id="operator-detail-zone"
        tabindex="-1"
        role="region"
        aria-label="Aktiver Alarmkontext"
        aria-keyshortcuts="Control+Shift+2"
        data-operator-focus-zone="detail"
      >
        ${renderSectionHeader(alarmCase.title, {
          subtitle: "Der Annahme-Screen nutzt denselben Alarmkontext wie die bestehende Detailansicht, arrangiert ihn aber fokussiert fuer den operativen Bildschirm.",
          pills: [
            renderPriorityPill(alarmCase.priority),
            renderAlarmLifecyclePill(alarmCase.lifecycleStatus),
            renderAlarmAssessmentPill(alarmCase.assessmentStatus),
            renderAlarmTechnicalStatePill(alarmCase.technicalState),
            renderAlarmAssignmentStatePill(activeAssignmentDisplay)
          ]
        })}
        <nav class="operator-detail-jumpnav" aria-label="Alarmannahme Bereiche">
          <a class="button-link secondary" href="#operator-context-overview">Lagebild</a>
          <a class="button-link secondary" href="#operator-context-actions">Aktionen</a>
          <a class="button-link secondary" href="#operator-context-log">Dokumentation</a>
          <a class="button-link secondary" href="#operator-context-secondary">Sekundaerkontext</a>
        </nav>
        <section class="detail-grid detail-grid-emphasis" id="operator-context-overview">
          <article class="subcard stack compact">
            <h4>Fallinformationen</h4>
            <dl class="facts compact-gap">
              <div><dt>Alarmzeit</dt><dd>${formatTimestamp(alarmCase.receivedAt)}</dd></div>
              <div><dt>Alter</dt><dd>${formatRelativeAge(alarmCase.receivedAt)}</dd></div>
              <div><dt>Letzte Aktivitaet</dt><dd>${formatTimestamp(alarmCase.lastEventAt)}</dd></div>
              <div><dt>Standort</dt><dd>${escapeHtml(site?.siteName ?? alarmCase.siteId)}</dd></div>
              <div><dt>Kunde</dt><dd>${escapeHtml(site?.customer.name ?? "-")}</dd></div>
              <div><dt>Primaergeraet</dt><dd>${escapeHtml(alarmCase.primaryDeviceId ?? "-")}</dd></div>
              <div><dt>Alarmtyp</dt><dd>${formatAlarmTypeLabel(alarmCase.alarmType)}</dd></div>
              <div><dt>Bewertung</dt><dd>${formatAlarmAssessmentLabel(alarmCase.assessmentStatus)}</dd></div>
              <div><dt>Status</dt><dd>${formatAlarmLifecycleLabel(alarmCase.lifecycleStatus)}</dd></div>
              <div><dt>Technik</dt><dd>${formatAlarmTechnicalStateLabel(alarmCase.technicalState)}</dd></div>
              <div><dt>Reaktionsfrist</dt><dd>${formatResponseDueAtValue(alarmCase.responseDueAt)}</dd></div>
              <div><dt>Friststatus</dt><dd>${formatAlarmResponseDeadlineStateLabel(alarmCase.responseDeadlineState)}</dd></div>
              <div><dt>Wiedervorlage</dt><dd>${formatFollowUpValue(alarmCase.followUpAt)}</dd></div>
              <div><dt>Bearbeitung</dt><dd>${formatActiveAssignmentSummary(activeAssignmentDisplay)}</dd></div>
            </dl>
            ${renderResponseDeadlineNotice(alarmCase)}
            ${renderAlarmAssignmentStatusNotice(activeAssignmentDisplay)}
            ${renderActiveFollowUpNotice(alarmCase.followUpAt, alarmCase.followUpNote)}
          </article>
          <article
            class="subcard stack compact operator-focus-zone"
            id="operator-context-actions"
            tabindex="-1"
            role="region"
            aria-label="Primaeraktionen fuer die Alarmannahme"
            aria-keyshortcuts="Control+Shift+3"
            data-operator-focus-zone="actions"
          >
            ${renderAlarmActionPanel(detail, { includeReport: false, includeExport: false })}
          </article>
        </section>
      </article>

      <section class="detail-grid" id="operator-context-secondary">
        ${renderAlarmMediaSection(detail, { maxPreviewCount: 3 })}
        <article class="subcard stack compact plan-detail-card">
          <h4>Lageplan / Objektplan</h4>
          ${planWorkspace || renderEmptyState("Fuer diesen Standort ist aktuell kein Objekt- oder Kameraplan hinterlegt.")}
        </article>
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
      </section>

      <section class="detail-grid" id="operator-context-log">
        <article class="subcard stack compact">
          <h4>Bewertung und Abschluss</h4>
          <form id="assessment-form" class="stack compact" data-ui-form-scope="operator-screen:${alarmCase.id}" data-ui-preserve-form="true">
            <label class="field"><span>Bewertung</span><select name="assessmentStatus">${renderOptions(["pending", "confirmed_incident", "false_positive"], alarmCase.assessmentStatus)}</select></label>
            <label class="field"><span>Fehlalarmgrund</span><select name="falsePositiveReasonId">${falsePositiveReasonOptions}</select></label>
            <button type="submit" ${!isWritable ? "disabled" : ""}>Bewertung speichern</button>
          </form>
          <form id="close-form" class="stack compact" data-ui-form-scope="operator-close:${alarmCase.id}" data-ui-preserve-form="true">
            <label class="field"><span>Abschlussgrund</span><select name="closureReasonId">${closureReasonOptions}</select></label>
            <label class="field"><span>Kommentar optional</span><input name="comment" placeholder="Abschlussnotiz" /></label>
            <button type="submit" ${!isWritable || alarmCase.lifecycleStatus === "resolved" || alarmCase.lifecycleStatus === "archived" ? "disabled" : ""}>Fall schliessen</button>
          </form>
        </article>
        <article class="subcard stack compact">
          <h4>Massnahmen und Kommentare</h4>
          <form id="follow-up-form" class="stack compact" data-ui-form-scope="operator-follow-up:${alarmCase.id}" data-ui-preserve-form="true">
            <label class="field"><span>Wiedervorlage</span><input name="followUpAt" type="datetime-local" required value="${escapeHtml(formatDateTimeLocalValue(alarmCase.followUpAt))}" /></label>
            <label class="field"><span>Notiz optional</span><input name="note" placeholder="z. B. Rueckruf pruefen" value="${escapeHtml(alarmCase.followUpNote ?? "")}" /></label>
            <div class="actions">
              <button type="submit" ${!isWritable || alarmCase.lifecycleStatus === "resolved" || alarmCase.lifecycleStatus === "archived" ? "disabled" : ""}>${alarmCase.followUpAt ? "Wiedervorlage aktualisieren" : "Wiedervorlage setzen"}</button>
              <button type="button" id="follow-up-clear-button" class="secondary" ${!isWritable || !alarmCase.followUpAt ? "disabled" : ""}>Wiedervorlage entfernen</button>
            </div>
          </form>
          <form id="action-form" class="stack compact" data-ui-form-scope="operator-action:${alarmCase.id}" data-ui-preserve-form="true">
            <label class="field"><span>Massnahmeart</span><select name="actionTypeId">${actionTypeOptions}</select></label>
            <label class="field"><span>Status</span><select name="statusId">${actionStatusOptions}</select></label>
            <label class="field"><span>Kommentar</span><input name="comment" placeholder="Rueckmeldung / Abarbeitung" required /></label>
            <button type="submit" ${!isWritable ? "disabled" : ""}>Massnahme speichern</button>
          </form>
          <form id="comment-form" class="stack compact" data-ui-form-scope="operator-comment:${alarmCase.id}" data-ui-preserve-form="true">
            <label class="field"><span>Kommentar</span><input name="body" placeholder="Kurze Lage- oder Uebergabenotiz" required /></label>
            <button type="submit" ${!isWritable ? "disabled" : ""}>Kommentar speichern</button>
          </form>
        </article>
      </section>

      <section class="detail-grid">
        <article class="subcard stack compact">
          <h4>Einsatzanweisungen</h4>
          <label class="field">
            <span>Zeitkontext fuer Anweisungen</span>
            <select id="detail-time-context">${renderOptions(["normal", "weekend", "special"], state.selectedInstructionTimeContext ?? detail.instructionContext.timeContext)}</select>
          </label>
          ${detail.instructionContext.profiles.length > 0
            ? detail.instructionContext.profiles.map(renderInstructionProfile).join("")
            : renderEmptyState("Keine Einsatzanweisungen fuer diesen Kontext hinterlegt.")}
        </article>
        <article class="subcard stack compact">
          <h4>Dokumentation</h4>
          ${renderAlarmActionLog(detail)}
          ${renderAlarmCommentLog(detail)}
        </article>
        <article class="subcard stack compact">
          <h4>Fallakte</h4>
          ${renderAlarmEventTimeline(detail)}
        </article>
      </section>
    </section>
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

