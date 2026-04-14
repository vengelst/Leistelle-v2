import type { OperatorLayoutWidgetId, OperatorWindowRole } from "../state.js";

import { operatorLayoutTargetRoleLabel } from "../operator-layout.js";
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
  renderAlarmActionLog,
  renderAlarmActionPanel,
  renderAlarmAssessmentPill,
  renderAlarmAssignmentStatePill,
  renderAlarmAssignmentStatusNotice,
  renderAlarmCommentLog,
  renderAlarmEventTimeline,
  renderAlarmLifecyclePill,
  renderAlarmTechnicalStatePill,
  renderCatalogOptions,
  renderEmptyState,
  renderInstructionProfile,
  renderNotice,
  renderOptions,
  renderPipelineAssignmentQuickFilters,
  renderPill,
  renderPriorityPill,
  renderResponseDeadlineNotice,
  renderSectionHeader,
  renderSitePlanWorkspace,
  resolveActiveAssignmentDisplay
} from "./common.js";
import { renderAlarmMediaSection } from "./alarm-media.js";

export function renderOperatorScreen(): string {
  if (!state.session) {
    return renderEmptyState("Nach dem Login steht der dedizierte Alarmannahme-Screen fuer die Leitstelle bereit.");
  }

  const role = state.operatorWindowRole;
  const widgets = state.operatorLayout[role];
  return `
    <section class="stack operator-window-layout${role === "secondary" ? " operator-secondary-screen" : " operator-primary-screen"}" data-operator-keyboard-root="true">
      ${renderOperatorLayoutToolbar(role)}
      <section class="stack operator-layout-stack">
        ${widgets.map((widgetId) => renderOperatorLayoutWidget(widgetId, role)).join("")}
      </section>
    </section>
  `;
}

function renderOperatorLayoutToolbar(role: OperatorWindowRole): string {
  return `
    <article class="subcard stack compact operator-layout-toolbar-card">
      ${renderSectionHeader(role === "primary" ? "Hauptbildschirm" : "Alarmmonitor", {
        subtitle: role === "primary"
          ? "Standortdaten, Einsatzanweisungen und Dokumentation liegen standardmaessig auf Screen 1. Ueber den Layouteditor kannst du jede Box nach oben, unten oder auf Screen 2 verschieben."
          : "FIFO-Warteschlange, Medien und Vor-Ort-Karte liegen standardmaessig auf Screen 2. Ueber den Layouteditor kannst du jede Box auf Screen 1 oder Screen 2 umhaengen.",
        pills: [
          renderPill(operatorLayoutTargetRoleLabel(role)),
          renderPill(state.operatorLayout.presetId === "custom" ? "Layout individuell" : state.operatorLayout.presetId === "single-screen" ? "Preset 1 Bildschirm" : "Preset 2 Bildschirme"),
          renderPill(state.operatorLayoutEditorOpen ? "Editor aktiv" : "Editor aus")
        ]
      })}
      <div class="actions operator-layout-toolbar-actions">
        <button type="button" id="operator-layout-editor-toggle" class="secondary">${state.operatorLayoutEditorOpen ? "Layouteditor beenden" : "Layouteditor starten"}</button>
        <button type="button" class="secondary" data-operator-layout-preset="single-screen">Preset 1 Bildschirm</button>
        <button type="button" class="secondary" data-operator-layout-preset="two-screen">Preset 2 Bildschirme</button>
      </div>
      <p class="muted">${state.operatorLayoutEditorOpen
        ? "Widgets lassen sich jetzt per Hoch, Runter, Auf Screen 1 und Auf Screen 2 neu anordnen. Das Layout wird sofort gespeichert und zwischen beiden Fenstern synchronisiert."
        : "Das aktuelle Widget-Layout wird pro Benutzer gespeichert und in beiden Fenstern gemeinsam verwendet."}</p>
      ${state.operatorLayoutEditorOpen ? renderOperatorLayoutEditorBoard() : ""}
    </article>
  `;
}

function renderOperatorLayoutEditorBoard(): string {
  return `
    <section class="stack operator-layout-editor-board">
      <div class="operator-layout-editor-columns">
        ${renderOperatorLayoutEditorColumn("primary")}
        ${renderOperatorLayoutEditorColumn("secondary")}
      </div>
      <article class="subcard stack compact operator-layout-profile-card">
        <h4>Benannte Layouts</h4>
        <form id="operator-layout-save-form" class="actions">
          <input id="operator-layout-name-input" name="layoutName" value="${escapeHtml(state.operatorLayoutDraftName)}" placeholder="z. B. Tagdienst" />
          <button type="submit">Aktuelles Layout speichern</button>
        </form>
        <div class="stack compact">
          ${state.operatorLayoutProfiles.length > 0
            ? state.operatorLayoutProfiles.map((profile) => `
                <div class="actions operator-layout-profile-row">
                  <strong>${escapeHtml(profile.name)}</strong>
                  <div class="actions">
                    <button type="button" class="secondary" data-operator-layout-profile-id="${profile.id}" data-operator-layout-apply="true">Anwenden</button>
                    <button type="button" class="secondary" data-operator-layout-profile-id="${profile.id}" data-operator-layout-delete="true">Loeschen</button>
                  </div>
                </div>
              `).join("")
            : `<p class="muted">Noch keine benannten Layouts gespeichert.</p>`}
        </div>
      </article>
    </section>
  `;
}

function renderOperatorLayoutEditorColumn(role: OperatorWindowRole): string {
  const widgets = state.operatorLayout[role];
  return `
    <article class="subcard stack compact operator-layout-editor-column">
      <div class="actions">
        <h4>${operatorLayoutTargetRoleLabel(role)}</h4>
        <span class="pill">${widgets.length} Widgets</span>
      </div>
      ${widgets.map((widgetId, index) => `
        ${renderOperatorLayoutDropZone(role, index)}
        <article class="operator-layout-editor-item" draggable="true" data-layout-drag-widget-id="${widgetId}">
          <div class="actions">
            <strong>${operatorWidgetLabel(widgetId)}</strong>
            <span class="pill">${renderOperatorWidgetSizeSummary(widgetId)}</span>
          </div>
          <div class="actions operator-layout-editor-size-actions">
            <button type="button" class="secondary" data-widget-id="${widgetId}" data-layout-width="normal">Breite M</button>
            <button type="button" class="secondary" data-widget-id="${widgetId}" data-layout-width="wide">Breite L</button>
            <button type="button" class="secondary" data-widget-id="${widgetId}" data-layout-width="full">Breite XL</button>
            <button type="button" class="secondary" data-widget-id="${widgetId}" data-layout-height="normal">Hoehe M</button>
            <button type="button" class="secondary" data-widget-id="${widgetId}" data-layout-height="tall">Hoehe L</button>
          </div>
        </article>
      `).join("")}
      ${renderOperatorLayoutDropZone(role, widgets.length)}
    </article>
  `;
}

function renderOperatorLayoutDropZone(role: OperatorWindowRole, index: number): string {
  return `<div class="operator-layout-drop-zone" data-layout-drop-role="${role}" data-layout-drop-index="${index}">Hierher ziehen</div>`;
}

function renderOperatorWidgetSizeSummary(widgetId: OperatorLayoutWidgetId): string {
  const size = state.operatorLayout.widgetSizes[widgetId];
  return `${size.width} / ${size.height}`;
}

function operatorWidgetShellClass(widgetId: OperatorLayoutWidgetId): string {
  const size = state.operatorLayout.widgetSizes[widgetId];
  return `stack operator-layout-widget widget-width-${size.width} widget-height-${size.height}`;
}

function renderOperatorLayoutWidget(widgetId: OperatorLayoutWidgetId, role: OperatorWindowRole): string {
  const className = operatorWidgetShellClass(widgetId);
  switch (widgetId) {
    case "queue":
      return `
        <section class="${className} operator-layout-widget-queue">
          ${renderOperatorWidgetEditorBar(widgetId, role)}
          ${renderOperatorQueueCard(role)}
        </section>
      `;
    case "site":
      return renderOperatorSiteWidget(role);
    case "instructions":
      return renderOperatorInstructionsWidget(role);
    case "actions":
      return renderOperatorActionsWidget(role);
    case "documentation":
      return renderOperatorDocumentationWidget(role);
    case "media":
      return renderOperatorMediaWidget(role);
    case "plan":
      return renderOperatorPlanWidget(role);
    case "source":
      return renderOperatorSourceWidget(role);
    default:
      return "";
  }
}

function renderOperatorWidgetEditorBar(widgetId: OperatorLayoutWidgetId, role: OperatorWindowRole): string {
  if (!state.operatorLayoutEditorOpen) {
    return "";
  }

  const widgets = state.operatorLayout[role];
  const index = widgets.indexOf(widgetId);
  const targetRole: OperatorWindowRole = role === "primary" ? "secondary" : "primary";
  const targetAction = targetRole === "primary" ? "to-primary" : "to-secondary";
  return `
    <div class="subcard compact operator-widget-editor-bar">
      <div class="actions">
        <strong>${operatorWidgetLabel(widgetId)}</strong>
        <span class="pill">${operatorLayoutTargetRoleLabel(role)}</span>
      </div>
      <div class="actions">
        <button type="button" class="secondary" data-widget-id="${widgetId}" data-operator-layout-action="up" ${index <= 0 ? "disabled" : ""}>Hoch</button>
        <button type="button" class="secondary" data-widget-id="${widgetId}" data-operator-layout-action="down" ${index < 0 || index >= widgets.length - 1 ? "disabled" : ""}>Runter</button>
        <button type="button" class="secondary" data-widget-id="${widgetId}" data-operator-layout-action="${targetAction}">Auf ${operatorLayoutTargetRoleLabel(targetRole)}</button>
      </div>
    </div>
  `;
}

function renderOperatorQueueCard(role: OperatorWindowRole): string {
  return `
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
        subtitle: "Die Warteschlange ist hier strikt FIFO nach Eingangszeit sortiert. Ein Klick oeffnet den Alarm fuer beide Leitstellenfenster.",
        pills: [
          renderPill(operatorLayoutTargetRoleLabel(role)),
          renderPill(`${state.openAlarms.length} offen`),
          ...(state.pendingOperations["open-alarms"] ? [renderPill("laedt")] : [])
        ]
      })}
      <p class="muted operator-shortcut-hint">Tastatur: Strg+Umschalt+1/2/3 fuer Liste, Detail und Aktionen, Strg+Umschalt+Pfeil hoch/runter fuer die Warteschlange, Strg+Umschalt+Eingabe zum Oeffnen, Strg+Umschalt+R zum Uebernehmen, Strg+Umschalt+Q zum Quittieren, Strg+Umschalt+E fuer Sicherheitsdienst, Strg+Umschalt+F fuer Filter und Esc zurueck zur Liste.</p>
      <div class="actions">
        <button type="button" id="pipeline-reset-button" class="secondary">Filter zuruecksetzen</button>
      </div>
      <div class="operator-screen-queue-panel" data-ui-preserve-scroll="operator-screen-queue">
        ${renderOperatorQueue()}
      </div>
    </article>
  `;
}

function renderOperatorQueue(): string {
  const filteredAlarms = applyClientSidePipelineFilter(state.openAlarms)
    .slice()
    .sort((left, right) => {
      const receivedDifference = new Date(left.receivedAt).getTime() - new Date(right.receivedAt).getTime();
      if (receivedDifference !== 0) {
        return receivedDifference;
      }

      return new Date(left.lastEventAt).getTime() - new Date(right.lastEventAt).getTime();
    });

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
                ...(isMine ? [renderPill("mein Alarm")] : isTaken ? [renderPill("anderer Bearbeiter")] : [renderPill("frei")])
              ],
              actions: `<button type="button" class="secondary operator-accept-button operator-entry-button" data-operator-entry-button="true" data-alarm-case-id="${alarm.id}" aria-current="${isSelected ? "true" : "false"}" ${!canTakeOver ? "disabled" : ""}>${isMine ? "Auf beiden Screens oeffnen" : canOverride && isTaken ? "Override uebernehmen" : "Uebernehmen"}</button>`
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

function renderOperatorSiteWidget(role: OperatorWindowRole): string {
  if (!state.selectedAlarmDetail) {
    return renderOperatorPlaceholderWidget(
      "site",
      role,
      "Aktiver Alarmkontext",
      "Im FIFO-Monitor einen Alarm oeffnen. Danach erscheinen hier Standortdaten, Fallinformationen und der aktuelle Bearbeitungsstatus."
    );
  }

  const detail = state.selectedAlarmDetail;
  const alarmCase = detail.alarmCase;
  const activeAssignmentDisplay = resolveActiveAssignmentDisplay(detail);
  const site = state.overview?.sites.find((entry) => entry.id === alarmCase.siteId);
  const monitoringInterval = site?.settings?.monitoringIntervalSeconds;
  const failureThreshold = site?.settings?.failureThreshold;

  return `
    <section class="${operatorWidgetShellClass("site")}">
      ${renderOperatorWidgetEditorBar("site", role)}
      <article
        class="subcard stack compact operator-focus-zone"
        id="operator-detail-zone"
        tabindex="-1"
        role="region"
        aria-label="Aktiver Alarmkontext"
        aria-keyshortcuts="Control+Shift+2"
        data-operator-focus-zone="detail"
      >
        ${renderSectionHeader(alarmCase.title, {
          subtitle: "Standortdaten und aktueller Bearbeitungsstatus koennen frei auf Screen 1 oder Screen 2 liegen.",
          pills: [
            renderPill(operatorLayoutTargetRoleLabel(role)),
            renderPriorityPill(alarmCase.priority),
            renderAlarmLifecyclePill(alarmCase.lifecycleStatus),
            renderAlarmAssessmentPill(alarmCase.assessmentStatus),
            renderAlarmTechnicalStatePill(alarmCase.technicalState),
            renderAlarmAssignmentStatePill(activeAssignmentDisplay)
          ]
        })}
        <dl class="facts compact-gap">
          <div><dt>Alarmzeit</dt><dd>${formatTimestamp(alarmCase.receivedAt)}</dd></div>
          <div><dt>Alter</dt><dd>${formatRelativeAge(alarmCase.receivedAt)}</dd></div>
          <div><dt>Letzte Aktivitaet</dt><dd>${formatTimestamp(alarmCase.lastEventAt)}</dd></div>
          <div><dt>Standort</dt><dd>${escapeHtml(site?.siteName ?? alarmCase.siteId)}</dd></div>
          <div><dt>Kunde</dt><dd>${escapeHtml(site?.customer.name ?? "-")}</dd></div>
          <div><dt>Adresse</dt><dd>${site ? escapeHtml(`${site.address.street}, ${site.address.postalCode} ${site.address.city}, ${site.address.country}`) : "-"}</dd></div>
          <div><dt>Status</dt><dd>${formatAlarmLifecycleLabel(alarmCase.lifecycleStatus)}</dd></div>
          <div><dt>Alarmtyp</dt><dd>${formatAlarmTypeLabel(alarmCase.alarmType)}</dd></div>
          <div><dt>Technik</dt><dd>${formatAlarmTechnicalStateLabel(alarmCase.technicalState)}</dd></div>
          <div><dt>Reaktionsfrist</dt><dd>${formatResponseDueAtValue(alarmCase.responseDueAt)}</dd></div>
          <div><dt>Friststatus</dt><dd>${formatAlarmResponseDeadlineStateLabel(alarmCase.responseDeadlineState)}</dd></div>
          <div><dt>Wiedervorlage</dt><dd>${formatFollowUpValue(alarmCase.followUpAt)}</dd></div>
          <div><dt>Monitoring</dt><dd>${typeof monitoringInterval === "number" && typeof failureThreshold === "number" ? `${monitoringInterval}s / Schwelle ${failureThreshold}` : "-"}</dd></div>
          <div><dt>Bearbeitung</dt><dd>${formatActiveAssignmentSummary(activeAssignmentDisplay)}</dd></div>
        </dl>
        ${renderResponseDeadlineNotice(alarmCase)}
        ${renderAlarmAssignmentStatusNotice(activeAssignmentDisplay)}
        ${renderActiveFollowUpNotice(alarmCase.followUpAt, alarmCase.followUpNote)}
      </article>
    </section>
  `;
}

function renderOperatorInstructionsWidget(role: OperatorWindowRole): string {
  if (!state.selectedAlarmDetail) {
    return renderOperatorPlaceholderWidget(
      "instructions",
      role,
      "Einsatzanweisungen",
      "Nach der Auswahl eines Alarms erscheinen hier die passenden Anweisungen fuer Normal-, Wochenend- oder Sonderlage."
    );
  }

  const detail = state.selectedAlarmDetail;
  return `
    <section class="${operatorWidgetShellClass("instructions")}">
      ${renderOperatorWidgetEditorBar("instructions", role)}
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
    </section>
  `;
}

function renderOperatorActionsWidget(role: OperatorWindowRole): string {
  if (!state.selectedAlarmDetail) {
    return renderOperatorPlaceholderWidget(
      "actions",
      role,
      "Primaeraktionen",
      "Nach der Auswahl eines Alarms erscheinen hier Uebernahme, Quittierung, Abschluss, Wiedervorlage und weitere Bearbeitungsaktionen."
    );
  }

  const detail = state.selectedAlarmDetail;
  const alarmCase = detail.alarmCase;
  const isWritable = !detail.isArchived;
  const falsePositiveReasonOptions = renderCatalogOptions(state.catalogs?.falsePositiveReasons ?? [], "Grund waehlen");
  const closureReasonOptions = renderCatalogOptions(state.catalogs?.closureReasons ?? [], "Abschlussgrund waehlen");
  const actionTypeOptions = renderCatalogOptions(state.catalogs?.actionTypes ?? [], "Massnahmeart waehlen");
  const actionStatusOptions = renderCatalogOptions(state.catalogs?.actionStatuses ?? [], "Status waehlen");

  return `
    <section class="${operatorWidgetShellClass("actions")}">
      ${renderOperatorWidgetEditorBar("actions", role)}
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
  `;
}

function renderOperatorDocumentationWidget(role: OperatorWindowRole): string {
  if (!state.selectedAlarmDetail) {
    return renderOperatorPlaceholderWidget(
      "documentation",
      role,
      "Dokumentation",
      "Aktionen, Kommentare und Fallakte erscheinen hier, sobald ein Alarm geoeffnet wurde."
    );
  }

  const detail = state.selectedAlarmDetail;
  return `
    <section class="${operatorWidgetShellClass("documentation")}">
      ${renderOperatorWidgetEditorBar("documentation", role)}
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
  `;
}

function renderOperatorMediaWidget(role: OperatorWindowRole): string {
  if (!state.selectedAlarmDetail) {
    return renderOperatorPlaceholderWidget(
      "media",
      role,
      "Snapshot- / Medienbezug",
      "Nach Auswahl eines Alarms erscheinen hier Bilder und Clip-Vorschauen aus dem bestehenden Medienkontext."
    );
  }

  return `
    <section class="${operatorWidgetShellClass("media")}">
      ${renderOperatorWidgetEditorBar("media", role)}
      ${renderAlarmMediaSection(state.selectedAlarmDetail, { maxPreviewCount: 6 })}
    </section>
  `;
}

function renderOperatorPlanWidget(role: OperatorWindowRole): string {
  if (!state.selectedAlarmDetail) {
    return renderOperatorPlaceholderWidget(
      "plan",
      role,
      "Lageplan / Objektplan / Kamerakarte",
      "Nach Auswahl eines Alarms erscheinen hier der vorhandene Objektplan oder Kameraplan des Standorts."
    );
  }

  const detail = state.selectedAlarmDetail;
  const planWorkspace = renderSitePlanWorkspace(detail.alarmCase.siteId, "alarm");
  return `
    <section class="${operatorWidgetShellClass("plan")}">
      ${renderOperatorWidgetEditorBar("plan", role)}
      <article class="subcard stack compact plan-detail-card">
        <h4>Lageplan / Objektplan / Kamerakarte</h4>
        ${planWorkspace || renderEmptyState("Fuer diesen Standort ist aktuell kein Objekt- oder Kameraplan hinterlegt.")}
      </article>
    </section>
  `;
}

function renderOperatorSourceWidget(role: OperatorWindowRole): string {
  if (!state.selectedAlarmDetail) {
    return renderOperatorPlaceholderWidget(
      "source",
      role,
      "Quelle / Eingang",
      "Rohdaten, Quellzeit und externe Referenzen erscheinen hier, sobald ein Alarm geoeffnet wurde."
    );
  }

  const alarmCase = state.selectedAlarmDetail.alarmCase;
  return `
    <section class="${operatorWidgetShellClass("source")}">
      ${renderOperatorWidgetEditorBar("source", role)}
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
  `;
}

function renderOperatorPlaceholderWidget(
  widgetId: OperatorLayoutWidgetId,
  role: OperatorWindowRole,
  title: string,
  message: string
): string {
  const extraAttributes = widgetId === "site"
    ? `id="operator-detail-zone" tabindex="-1" role="region" aria-label="${escapeHtml(title)}" aria-keyshortcuts="Control+Shift+2" data-operator-focus-zone="detail"`
    : widgetId === "actions"
      ? `id="operator-context-actions" tabindex="-1" role="region" aria-label="${escapeHtml(title)}" aria-keyshortcuts="Control+Shift+3" data-operator-focus-zone="actions"`
      : "";
  return `
    <section class="${operatorWidgetShellClass(widgetId)}">
      ${renderOperatorWidgetEditorBar(widgetId, role)}
      <article class="subcard stack compact operator-screen-placeholder${extraAttributes ? " operator-focus-zone" : ""}" ${extraAttributes}>
        ${renderSectionHeader(title, {
          pills: [renderPill(operatorLayoutTargetRoleLabel(role)), renderPill("Auswahl offen")]
        })}
        <p class="muted">${message}</p>
      </article>
    </section>
  `;
}

function operatorWidgetLabel(widgetId: OperatorLayoutWidgetId): string {
  switch (widgetId) {
    case "queue":
      return "FIFO-Warteschlange";
    case "site":
      return "Standort / Fall";
    case "instructions":
      return "Einsatzanweisungen";
    case "actions":
      return "Aktionen / Abschluss";
    case "documentation":
      return "Dokumentation";
    case "media":
      return "Medien";
    case "plan":
      return "Karte / Plan";
    case "source":
      return "Quelle / Eingang";
    default:
      return widgetId;
  }
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

