import type { OperatorLayoutWidgetId, OperatorWindowRole } from "../state.js";

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
  return role === "secondary" ? renderSecondaryOperatorScreen() : renderPrimaryOperatorScreen();
}

function renderPrimaryOperatorScreen(): string {
  return `
    <section class="stack operator-window-layout operator-primary-screen" data-operator-keyboard-root="true">
      ${renderOperatorScreenHeader("Hauptbildschirm", "Screen 1", "Wenn im Alarmmonitor ein Alarm angeklickt wird, erscheinen hier automatisch Standortdaten, Einsatzkontext und Bearbeitung.")}
      <section class="stack operator-layout-stack">
        ${renderOperatorLayoutWidget("site", "primary")}
        ${renderOperatorLayoutWidget("instructions", "primary")}
        ${renderOperatorLayoutWidget("actions", "primary")}
        ${renderOperatorLayoutWidget("documentation", "primary")}
        ${renderOperatorLayoutWidget("plan", "primary")}
      </section>
    </section>
  `;
}

function renderSecondaryOperatorScreen(): string {
  return `
    <section class="stack operator-window-layout operator-secondary-screen" data-operator-keyboard-root="true">
      ${renderOperatorScreenHeader("Alarmmonitor", "Screen 2", "Hier laeuft die FIFO-Pipeline. Ein Klick auf einen Alarm oeffnet Bilder und Clip hier und den Standortkontext auf Screen 1.")}
      <section class="operator-screen-layout">
        <aside class="operator-screen-queue-column">
          ${renderOperatorQueueCard("secondary")}
        </aside>
        <section class="operator-screen-context-column">
          ${renderOperatorLayoutWidget("media", "secondary")}
        </section>
      </section>
    </section>
  `;
}

function renderOperatorScreenHeader(title: string, screenLabel: string, subtitle: string): string {
  return `
    <article class="subcard stack compact operator-layout-toolbar-card">
      ${renderSectionHeader(title, {
        subtitle,
        pills: [renderPill(screenLabel)]
      })}
    </article>
  `;
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
  return "";
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
          renderPill(role === "primary" ? "Screen 1" : "Screen 2"),
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
          subtitle: "Standortdaten und aktueller Bearbeitungsstatus fuer den aktuell im Alarmmonitor gewaehlten Alarm.",
          pills: [
            renderPill(role === "primary" ? "Screen 1" : "Screen 2"),
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
          pills: [renderPill(role === "primary" ? "Screen 1" : "Screen 2"), renderPill("Auswahl offen")]
        })}
        <p class="muted">${message}</p>
      </article>
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

