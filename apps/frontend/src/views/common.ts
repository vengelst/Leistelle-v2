import type {
  AlarmCaseDetail,
  AlarmCatalogs,
  AlarmCaseExportDocument,
  AlarmAssessmentStatus,
  AlarmEventKind,
  AlarmLifecycleStatus,
  AlarmPipelineItem,
  AlarmResponseDeadlineState,
  AlarmTechnicalState,
  AlarmType,
  AlarmWorkflowProfile,
  AuthenticatedUser,
  CameraPlanMarker,
  MasterDataOverview,
  MonitoringDisturbanceType,
  MonitoringPipelineItem,
  MonitoringPriority,
  ReportingGroupBucket,
  SitePlan,
  SiteStatus,
  SiteTechnicalOverallStatus
} from "@leitstelle/contracts";

import { resolveSitePlanContext } from "../site-plan-context.js";
import { state, archiveLifecycleScopeOptions, archivePeriodOptions, deviceTypeOptions, monitoringPriorityOptions, planKindOptions, reportingAlarmTypeOptions, reportingDisturbanceTypeOptions, reportingGroupOptions, reportingPeriodOptions, siteStatusOptions, siteTechnicalStatusOptions, technicalStateOptions } from "../state.js";
import type { PipelineAssignmentScope, PipelineLifecycleScope } from "../state.js";
import { clamp, escapeHtml, formatDuration, formatTimestamp } from "../utils.js";

export { archiveLifecycleScopeOptions, archivePeriodOptions, deviceTypeOptions, monitoringPriorityOptions, planKindOptions, reportingAlarmTypeOptions, reportingDisturbanceTypeOptions, reportingGroupOptions, reportingPeriodOptions, siteStatusOptions, siteTechnicalStatusOptions, technicalStateOptions };

type NoticeTone = "default" | "success" | "error";

export function renderPill(label: string, className = ""): string {
  return `<span class="pill${className ? ` ${className}` : ""}">${escapeHtml(label)}</span>`;
}

export function renderPriorityPill(priority: string): string {
  return renderPill(formatAlarmPriorityLabel(priority), `priority-${priority}`);
}

export function renderAlarmLifecyclePill(status: AlarmLifecycleStatus): string {
  return renderPill(formatAlarmLifecycleLabel(status), `alarm-lifecycle-${status}`);
}

export function renderAlarmAssessmentPill(status: AlarmAssessmentStatus): string {
  return renderPill(formatAlarmAssessmentLabel(status), `alarm-assessment-${status}`);
}

export function renderAlarmTechnicalStatePill(status: AlarmTechnicalState): string {
  return renderPill(formatAlarmTechnicalStateLabel(status), `alarm-technical-${status}`);
}

export function renderNotice(message: string, tone: NoticeTone = "default", inline = false): string {
  return `<p class="notice${tone !== "default" ? ` ${tone}` : ""}${inline ? " inline-notice" : ""}">${escapeHtml(message)}</p>`;
}

export function renderEmptyState(message: string, className = "empty"): string {
  return `<p class="${className}">${escapeHtml(message)}</p>`;
}

export function renderSectionHeader(
  title: string,
  options?: {
    subtitle?: string;
    actions?: string;
    pills?: string[];
    level?: "h2" | "h3" | "h4";
  }
): string {
  const level = options?.level ?? "h3";
  return `
    <div class="section-header">
      <div class="section-header-copy">
        <${level}>${escapeHtml(title)}</${level}>
        ${options?.subtitle ? `<p class="muted">${escapeHtml(options.subtitle)}</p>` : ""}
      </div>
      ${options?.actions || options?.pills?.length
        ? `
          <div class="section-header-side">
            ${options?.pills?.length ? `<div class="section-pill-row">${options.pills.join("")}</div>` : ""}
            ${options?.actions ? `<div class="actions section-action-bar">${options.actions}</div>` : ""}
          </div>
        `
        : ""}
    </div>
  `;
}

export function renderUserFacts(user: AuthenticatedUser): string {
  return `<dl class="facts compact-gap"><div><dt>Name</dt><dd>${user.displayName}</dd></div><div><dt>Primaerrolle</dt><dd>${user.primaryRole}</dd></div><div><dt>Rollen</dt><dd>${user.roles.join(", ")}</dd></div><div><dt>Status</dt><dd>${user.status}</dd></div><div><dt>Pausengrund</dt><dd>${user.pauseReason ?? "-"}</dd></div></dl>`;
}

export function renderUserStatusBar(user: AuthenticatedUser): string {
  const statusBusy = Boolean(state.pendingOperations.status);
  const logoutBusy = Boolean(state.pendingOperations.logout);
  const avatar = user.avatarDataUrl
    ? `<img src="${escapeHtml(user.avatarDataUrl)}" alt="Benutzerbild ${escapeHtml(user.displayName)}" class="user-status-avatar desktop-only-avatar" />`
    : `<span class="user-status-avatar user-status-avatar-fallback desktop-only-avatar" aria-hidden="true">${escapeHtml(resolveUserInitials(user.displayName))}</span>`;

  return `
    <section class="user-status-bar" aria-label="Aktueller Benutzerstatus">
      <div class="user-status-copy">
        <p class="eyebrow">Aktive Session</p>
        <div class="user-status-identity">
          ${avatar}
          <strong>${escapeHtml(user.displayName)}</strong>
          <span class="muted">@${escapeHtml(user.username)}</span>
        </div>
        <div class="user-status-meta">
          ${renderPill(`Primaerrolle ${formatUserRoleLabel(user.primaryRole)}`)}
          ${renderPill(`Status ${formatUserStatusLabel(user.status)}`)}
          ${user.pauseReason ? renderPill(`Grund ${user.pauseReason}`) : ""}
        </div>
      </div>
      <div class="actions user-status-actions">
        <button
          type="button"
          class="secondary status-action-button"
          data-status-path="/api/v1/auth/status/pause"
          data-success-message="Pause gesetzt."
          ${statusBusy || user.status === "in_pause" ? "disabled" : ""}
        >Pause</button>
        <button
          type="button"
          class="secondary status-action-button"
          data-status-path="/api/v1/auth/status/resume"
          data-success-message="Pause beendet."
          ${statusBusy || user.status !== "in_pause" ? "disabled" : ""}
        >Resume</button>
        <button type="button" class="secondary logout-button" ${logoutBusy ? "disabled" : ""}>Logout</button>
      </div>
    </section>
  `;
}

function resolveUserInitials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";
}

export function isAutoAssignedAlarmDetail(detail: AlarmCaseDetail | null): boolean {
  if (!detail) {
    return false;
  }

  const activeAssignment = detail.assignments.find((assignment) => assignment.releasedAt === undefined);
  if (!activeAssignment) {
    return false;
  }

  for (let index = detail.events.length - 1; index >= 0; index -= 1) {
    const event = detail.events[index]!;
    if (event.eventKind !== "assignment_changed" || !event.payload) {
      continue;
    }

    if (
      event.payload["action"] === "reserve"
      && event.payload["targetUserId"] === activeAssignment.userId
      && event.payload["trigger"] === "auto_assignment_light"
    ) {
      return true;
    }
  }

  return false;
}

export function formatUserRoleLabel(role: AuthenticatedUser["primaryRole"]): string {
  switch (role) {
    case "administrator":
      return "Administrator";
    case "leitstellenleiter":
      return "Leitstellenleitung";
    case "operator":
      return "Operator";
    case "service":
      return "Service";
    default:
      return role;
  }
}

export function formatAlarmPriorityLabel(priority: string): string {
  switch (priority) {
    case "critical":
      return "Kritisch";
    case "high":
      return "Hoch";
    case "normal":
      return "Normal";
    case "low":
      return "Niedrig";
    default:
      return priority;
  }
}

export function formatAlarmLifecycleLabel(status: AlarmLifecycleStatus): string {
  switch (status) {
    case "received":
      return "Neu";
    case "queued":
      return "In Queue";
    case "reserved":
      return "Reserviert";
    case "in_progress":
      return "In Bearbeitung";
    case "resolved":
      return "Abgeschlossen";
    case "archived":
      return "Archiviert";
    default:
      return status;
  }
}

export function formatAlarmAssessmentLabel(status: AlarmAssessmentStatus): string {
  switch (status) {
    case "pending":
      return "Offen";
    case "confirmed_incident":
      return "Vorfall bestaetigt";
    case "false_positive":
      return "Fehlalarm";
    default:
      return status;
  }
}

export function formatAlarmTechnicalStateLabel(status: AlarmTechnicalState): string {
  switch (status) {
    case "complete":
      return "Vollstaendig";
    case "incomplete":
      return "Unvollstaendig";
    default:
      return status;
  }
}

export function formatAlarmResponseDeadlineStateLabel(stateValue: AlarmResponseDeadlineState): string {
  switch (stateValue) {
    case "within_deadline":
      return "innerhalb Frist";
    case "due_soon":
      return "Frist bald faellig";
    case "overdue":
      return "ueberfaellig";
    case "met":
      return "reagiert";
    default:
      return stateValue;
  }
}

export function formatAlarmTypeLabel(type: AlarmType): string {
  switch (type) {
    case "motion":
      return "Bewegung";
    case "line_crossing":
      return "Linienuebertritt";
    case "area_entry":
      return "Bereichseintritt";
    case "sabotage":
      return "Sabotage";
    case "video_loss":
      return "Videobild weg";
    case "camera_offline":
      return "Kamera offline";
    case "nvr_offline":
      return "NVR offline";
    case "router_offline":
      return "Router offline";
    case "technical":
      return "Technischer Alarm";
    case "other_disturbance":
      return "Sonstige Stoerung";
    default:
      return type;
  }
}

export function formatAlarmEventKindLabel(kind: AlarmEventKind): string {
  switch (kind) {
    case "case_created":
      return "Fall angelegt";
    case "payload_updated":
      return "Quelldaten aktualisiert";
    case "status_changed":
      return "Status geaendert";
    case "assessment_changed":
      return "Bewertung geaendert";
    case "technical_state_changed":
      return "Technikstatus geaendert";
    case "media_attached":
      return "Medium angehaengt";
    case "assignment_changed":
      return "Zuweisung geaendert";
    case "comment_added":
      return "Kommentar hinzugefuegt";
    case "action_documented":
      return "Massnahme dokumentiert";
    case "follow_up_updated":
      return "Wiedervorlage aktualisiert";
    case "follow_up_cleared":
      return "Wiedervorlage entfernt";
    default:
      return kind;
  }
}

export function formatRelativeAge(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) {
    return "jetzt";
  }
  const totalSeconds = Math.floor(diffMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);
  if (totalDays > 0) {
    return `${totalDays}d ${totalHours % 24}h`;
  }
  if (totalHours > 0) {
    return `${totalHours}h ${totalMinutes % 60}m`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes}m`;
  }
  return `${totalSeconds}s`;
}

export function applyClientSidePipelineFilter(items: AlarmPipelineItem[]): AlarmPipelineItem[] {
  const { lifecycleScope, assignmentScope } = state.pipelineFilter;
  let filtered = items;
  if (lifecycleScope) {
    filtered = filtered.filter((item) => item.lifecycleStatus === lifecycleScope);
  }
  if (assignmentScope === "mine") {
    const userId = state.session?.user.id;
    filtered = filtered.filter((item) => item.activeAssignment?.userId === userId);
  } else if (assignmentScope === "unassigned") {
    filtered = filtered.filter((item) => !item.activeAssignment);
  }
  return filtered;
}

export function renderPipelineLifecycleOptions(): string {
  const scopes: Array<{ value: PipelineLifecycleScope; label: string }> = [
    { value: "", label: "alle Status" },
    { value: "queued", label: "In Queue" },
    { value: "reserved", label: "Reserviert" },
    { value: "in_progress", label: "In Bearbeitung" }
  ];
  return scopes.map((entry) => renderOption(entry.value, entry.label, (state.pipelineFilter.lifecycleScope ?? "") === entry.value)).join("");
}

export function renderPipelineAssignmentScopeOptions(): string {
  const scopes: Array<{ value: PipelineAssignmentScope; label: string }> = [
    { value: "all", label: "alle Faelle" },
    { value: "mine", label: "meine Faelle" },
    { value: "unassigned", label: "unzugewiesene Faelle" }
  ];
  return scopes.map((entry) => renderOption(entry.value, entry.label, (state.pipelineFilter.assignmentScope ?? "all") === entry.value)).join("");
}

export function renderPipelineAssignmentQuickFilters(): string {
  const activeScope = state.pipelineFilter.assignmentScope ?? "all";
  const scopes: Array<{ value: PipelineAssignmentScope; label: string }> = [
    { value: "all", label: "Alle" },
    { value: "mine", label: "Meine" },
    { value: "unassigned", label: "Unzugewiesene" }
  ];
  return `
    <div class="actions">
      ${scopes.map((entry) => `<button type="button" class="${activeScope === entry.value ? "" : "secondary"}" data-pipeline-assignment-scope="${entry.value}" aria-pressed="${activeScope === entry.value ? "true" : "false"}">${entry.label}</button>`).join("")}
    </div>
  `;
}

type AssignmentSummary = {
  userId: string;
  displayName?: string;
  assignedAt: string;
};

function getAssignmentVisualState(assignment: AssignmentSummary | undefined): "unassigned" | "mine" | "other" {
  if (!assignment) {
    return "unassigned";
  }
  return assignment.userId === state.session?.user.id ? "mine" : "other";
}

export function renderAlarmAssignmentStatePill(assignment: AssignmentSummary | undefined): string {
  switch (getAssignmentVisualState(assignment)) {
    case "mine":
      return renderPill("mein Fall");
    case "other":
      return renderPill("anderer Bearbeiter");
    default:
      return renderPill("unzugewiesen");
  }
}

export function renderAlarmAssignmentStatusNotice(assignment: AssignmentSummary | undefined): string {
  switch (getAssignmentVisualState(assignment)) {
    case "mine":
      return renderNotice(`Dir zugewiesen seit ${formatTimestamp(assignment!.assignedAt)}.`, "success", true);
    case "other":
      return renderNotice(`Zugewiesen an ${assignment!.displayName ?? assignment!.userId} seit ${formatTimestamp(assignment!.assignedAt)}.`, "default", true);
    default:
      return renderNotice("Aktuell unzugewiesen. Mit \"Uebernehmen\" kann der Fall direkt reserviert werden.", "default", true);
  }
}

export function resolveActiveAssignmentDisplay(detail: AlarmCaseDetail): AssignmentSummary | undefined {
  const activeAssignment = readActiveAssignment(detail);
  if (!activeAssignment) {
    return undefined;
  }

  const pipelineAssignment = state.openAlarms.find((item) => item.id === detail.alarmCase.id)?.activeAssignment;
  return {
    userId: activeAssignment.userId,
    assignedAt: activeAssignment.assignedAt,
    ...(pipelineAssignment?.userId === activeAssignment.userId ? { displayName: pipelineAssignment.displayName } : {})
  };
}

export function renderAlarmAssignmentTransferForm(
  alarmCaseId: string,
  options: {
    disabled: boolean;
    canOverride: boolean;
    currentOwnerUserId?: string;
    formScope: string;
    submitLabel?: string;
  }
): string {
  const datalistId = `assignment-targets-${alarmCaseId}`;
  const activeOperators = (state.dashboard?.highlights.activeOperators ?? []).filter((entry) => entry.id !== options.currentOwnerUserId);
  return `
    <form class="assignment-form stack compact" data-alarm-case-id="${alarmCaseId}" data-ui-form-scope="${escapeHtml(options.formScope)}" data-ui-preserve-form="true">
      <label class="field">
        <span>Ziel-Bearbeiter</span>
        <input name="targetUserId" ${activeOperators.length > 0 ? `list="${datalistId}"` : ""} placeholder="user-operator" />
      </label>
      ${activeOperators.length > 0 ? `<datalist id="${datalistId}">${activeOperators.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.displayName)}</option>`).join("")}</datalist>` : ""}
      <label class="field">
        <span>Begruendung optional</span>
        <input name="reason" placeholder="z. B. Schichtwechsel" />
      </label>
      ${options.canOverride
        ? `<label class="field"><span>Override</span><select name="override">${renderOptions(["false", "true"], "false")}</select></label>`
        : '<input type="hidden" name="override" value="false" />'}
      <button type="submit" class="secondary" ${options.disabled ? "disabled" : ""}>${escapeHtml(options.submitLabel ?? "Umhaengen")}</button>
    </form>
  `;
}

export function renderAlarmActionPanel(
  detail: AlarmCaseDetail,
  options: { includeReport: boolean; includeExport: boolean }
): string {
  const alarmCase = detail.alarmCase;
  const activeAssignment = readActiveAssignment(detail);
  const activeAssignmentDisplay = resolveActiveAssignmentDisplay(detail);
  const canOverride = state.session?.user.roles.some((role) => role === "administrator" || role === "leitstellenleiter") ?? false;
  const isMine = activeAssignment?.userId === state.session?.user.id;
  const isWritable = !detail.isArchived;
  const canTakeOver = !activeAssignment || (canOverride && !isMine);
  const canAcknowledge = isWritable
    && alarmCase.lifecycleStatus !== "resolved"
    && alarmCase.lifecycleStatus !== "archived"
    && alarmCase.lifecycleStatus !== "in_progress"
    && (!activeAssignment || isMine || canOverride);
  const isAutoAssigned = isAutoAssignedAlarmDetail(detail);
  const reserveLabel = !activeAssignment ? "Jetzt uebernehmen" : canOverride && !isMine ? "Override uebernehmen" : isMine ? "Bereits uebernommen" : "Bereits belegt";
  return `
    <h4>Primaeraktionen</h4>
    <p class="muted operator-shortcut-hint">Shortcuts: Strg+Umschalt+R uebernehmen, Strg+Umschalt+Q quittieren, Strg+Umschalt+E Sicherheitsdienst, Strg+Umschalt+C Abschlussformular fokussieren.</p>
    <div class="actions operator-primary-actions">
      <button type="button" id="detail-reserve-button" ${!isWritable || !canTakeOver ? "disabled" : ""}>${reserveLabel}</button>
      <button type="button" id="detail-acknowledge-button" ${canAcknowledge ? "" : "disabled"}>Quittieren</button>
      <button type="button" id="quick-confirm-button" ${!isWritable ? "disabled" : ""}>Vorfall bestaetigen</button>
    </div>
    <div class="actions operator-primary-actions">
      <button type="button" id="quick-false-positive-button" class="secondary" ${!isWritable ? "disabled" : ""}>Fehlalarm setzen</button>
      <button type="button" id="detail-release-button" class="secondary" ${!activeAssignment || (!isMine && !canOverride) ? "disabled" : ""}>Freigeben</button>
      <button type="submit" form="close-form" class="secondary" ${!isWritable || alarmCase.lifecycleStatus === "resolved" || alarmCase.lifecycleStatus === "archived" ? "disabled" : ""}>Fall schliessen</button>
      <button type="button" id="archive-button" class="secondary" ${alarmCase.lifecycleStatus !== "resolved" || detail.isArchived ? "disabled" : ""}>Archivieren</button>
    </div>
    <div class="operator-action-group">
      <h5>Eskalation / Weitergabe</h5>
      <div class="actions">
        <button type="button" class="secondary quick-action-button" data-action-type-id="action-call-security" ${!isWritable ? "disabled" : ""}>An Sicherheitsdienst eskalieren</button>
        <button type="button" class="secondary quick-action-button" data-action-type-id="action-call-police" ${!isWritable ? "disabled" : ""}>An Polizei eskalieren</button>
        <button type="button" class="secondary quick-action-button" data-action-type-id="action-call-customer" ${!isWritable ? "disabled" : ""}>Kunde informieren</button>
      </div>
    </div>
    <div class="operator-action-group">
      <h5>Zuweisung</h5>
      <div class="actions">
        ${renderAlarmAssignmentStatePill(activeAssignmentDisplay)}
      </div>
      <p class="muted">Bearbeitung: ${escapeHtml(formatActiveAssignmentSummary(activeAssignmentDisplay))}</p>
      ${renderAlarmAssignmentStatusNotice(activeAssignmentDisplay)}
      ${renderAlarmAssignmentTransferForm(alarmCase.id, {
        disabled: !isWritable || !activeAssignment || (!isMine && !canOverride),
        canOverride,
        formScope: `alarm-assignment-detail:${alarmCase.id}`,
        submitLabel: canOverride ? "Umhaengen / uebernehmen" : "Umhaengen",
        ...(activeAssignment?.userId ? { currentOwnerUserId: activeAssignment.userId } : {})
      })}
    </div>
    <div class="operator-action-group">
      <h5>Sekundaer</h5>
      <div class="actions">
        <button type="button" id="detail-refresh-button" class="secondary">Neu laden</button>
        ${options.includeReport ? '<button type="button" id="detail-report-refresh-button" class="secondary">Bericht laden</button>' : ""}
        ${options.includeExport ? `
          <button type="button" class="secondary detail-export-button" data-format="case_report">Fallbericht exportieren</button>
          <button type="button" class="secondary detail-export-button" data-format="pdf">PDF exportieren</button>
          <button type="button" class="secondary detail-export-button" data-format="excel">Excel exportieren</button>
        ` : ""}
      </div>
    </div>
    ${isAutoAssigned ? renderNotice("Automatisch zugewiesen (Auto-Zuordnung light). Die bestehende Reservierungslogik bleibt unveraendert fuehrend.", "success", true) : ""}
    ${alarmCase.lifecycleStatus === "reserved" ? renderNotice("Der Alarm ist reserviert, aber noch nicht quittiert. Mit \"Quittieren\" wird die aktive Bearbeitungsphase gestartet.", "default", true) : ""}
    ${detail.isArchived ? renderNotice("Der Alarm ist archiviert und bleibt schreibgeschuetzt.", "default", true) : ""}
    ${detail.closureReason ? `<p class="muted">Abschlussgrund: ${detail.closureReason.label}</p>` : alarmCase.lifecycleStatus !== "resolved" && alarmCase.lifecycleStatus !== "archived" ? `<p class="muted">Noch kein Abschlussgrund gesetzt.</p>` : ""}
  `;
}

export function renderAlarmEventTimeline(detail: AlarmCaseDetail): string {
  if (detail.events.length === 0) {
    return renderEmptyState("Noch keine Historieneintraege vorhanden.");
  }
  return `<ul class="plain-list">${detail.events.map((event) => `<li>${formatTimestamp(event.occurredAt)} | ${formatAlarmEventKindLabel(event.eventKind)}${event.message ? ` | ${escapeHtml(event.message)}` : ""}</li>`).join("")}</ul>`;
}

export function renderAlarmActionLog(detail: AlarmCaseDetail): string {
  if (detail.actions.length === 0) {
    return renderEmptyState("Noch keine Massnahmen dokumentiert.");
  }
  return `<ul class="plain-list">${detail.actions.map((action) => `<li><strong>${action.actionTypeLabel}</strong> | ${action.statusLabel} | ${formatTimestamp(action.occurredAt)}${action.userDisplayName ? ` | ${escapeHtml(action.userDisplayName)}` : ""}<br/>${escapeHtml(action.comment)}</li>`).join("")}</ul>`;
}

export function renderAlarmCommentLog(detail: AlarmCaseDetail): string {
  if (detail.comments.length === 0) {
    return renderEmptyState("Noch keine Kommentare vorhanden.");
  }
  return `<ul class="plain-list">${detail.comments.map((comment) => `<li><strong>${escapeHtml(comment.userDisplayName ?? comment.userId)}</strong> | ${formatTimestamp(comment.createdAt)}<br/>${escapeHtml(comment.body)}</li>`).join("")}</ul>`;
}

export function formatFollowUpValue(followUpAt: string | undefined): string {
  return followUpAt ? formatTimestamp(followUpAt) : "-";
}

export function formatResponseDueAtValue(responseDueAt: string | undefined): string {
  return responseDueAt ? formatTimestamp(responseDueAt) : "-";
}

export function isOverdueFollowUp(followUpAt: string | undefined): boolean {
  if (!followUpAt) {
    return false;
  }
  const parsed = new Date(followUpAt);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now();
}

export function renderActiveFollowUpNotice(followUpAt: string | undefined, followUpNote: string | undefined): string {
  if (!followUpAt) {
    return renderNotice("Keine aktive Wiedervorlage gesetzt.", "default", true);
  }
  const overdue = isOverdueFollowUp(followUpAt);
  const message = overdue
    ? `Wiedervorlage ueberfaellig seit ${formatTimestamp(followUpAt)}.`
    : `Wiedervorlage aktiv fuer ${formatTimestamp(followUpAt)}.`;
  return `${renderNotice(message, overdue ? "error" : "success", true)}${followUpNote ? `<p class="muted">${escapeHtml(followUpNote)}</p>` : ""}`;
}

export function renderResponseDeadlineNotice(alarm: Pick<AlarmPipelineItem, "responseDueAt" | "responseDeadlineState" | "isEscalationReady" | "firstOpenedAt">): string {
  if (!alarm.responseDueAt) {
    return "";
  }
  if (alarm.isEscalationReady) {
    return renderNotice(`Reaktionsfrist ueberschritten seit ${formatTimestamp(alarm.responseDueAt)}. Fall ist eskalationsreif.`, "error", true);
  }
  if (alarm.responseDeadlineState === "due_soon") {
    return renderNotice(`Reaktionsfrist endet um ${formatTimestamp(alarm.responseDueAt)}.`, "default", true);
  }
  if (alarm.responseDeadlineState === "met" && alarm.firstOpenedAt) {
    return renderNotice(`Erstreaktion erfolgte am ${formatTimestamp(alarm.firstOpenedAt)}.`, "success", true);
  }
  return "";
}

export function formatUserStatusLabel(status: AuthenticatedUser["status"]): string {
  switch (status) {
    case "aktiv":
      return "Aktiv";
    case "in_pause":
      return "Pause";
    case "angemeldet":
      return "Angemeldet";
    case "assigned_to_alarm":
      return "Im Alarm";
    case "offline":
      return "Offline";
    default:
      return status;
  }
}

export function renderCustomerOptions(overview: MasterDataOverview | null): string {
  const customers = overview?.customers ?? [];
  if (customers.length === 0) return `<option value="">Bitte zuerst einen Customer anlegen</option>`;
  return customers.map((customer, index) => renderOption(customer.id, customer.name, index === 0)).join("");
}

export function renderSiteOptions(overview: MasterDataOverview | null): string {
  const sites = overview?.sites ?? [];
  if (sites.length === 0) return `<option value="">Bitte zuerst einen Standort anlegen</option>`;
  return sites.map((site, index) => renderOption(site.id, site.siteName, index === 0)).join("");
}

export function renderPipelineSiteOptions(): string {
  const options = ['<option value="">alle Standorte</option>'];
  for (const site of state.overview?.sites ?? []) options.push(renderOption(site.id, site.siteName, state.pipelineFilter.siteId === site.id));
  return options.join("");
}

export function renderPipelineTechnicalOptions(): string {
  const options = ['<option value="">alle technischen Stati</option>'];
  for (const value of technicalStateOptions) options.push(renderOption(value, value, state.pipelineFilter.technicalState === value));
  return options.join("");
}

export function renderMonitoringPriorityOptions(): string {
  const options = ['<option value="">alle Prioritaeten</option>'];
  for (const value of monitoringPriorityOptions) options.push(renderOption(value, value, state.monitoringFilter.priority === value));
  return options.join("");
}

export function renderMonitoringSiteStatusOptions(): string {
  const options = ['<option value="">alle Standortstati</option>'];
  for (const value of siteTechnicalStatusOptions) options.push(renderOption(value, value, state.monitoringFilter.siteTechnicalStatus === value));
  return options.join("");
}

export function renderReportingPeriodOptions(): string {
  return reportingPeriodOptions.map((value) => renderOption(value, value, state.reportingFilter.period === value)).join("");
}

export function renderArchivePeriodOptions(): string {
  return archivePeriodOptions.map((value) => renderOption(value, value, state.archiveFilter.period === value)).join("");
}

export function renderArchiveLifecycleScopeOptions(): string {
  return archiveLifecycleScopeOptions.map((value) => renderOption(value, value, state.archiveFilter.lifecycleScope === value)).join("");
}

export function renderReportingGroupOptions(): string {
  const options = ['<option value="">keine Gruppierung</option>'];
  for (const value of reportingGroupOptions) {
    options.push(renderOption(value, value, state.reportingFilter.groupBy === value));
  }
  return options.join("");
}

export function renderReportingCustomerOptions(): string {
  const options = ['<option value="">alle Kunden</option>'];
  for (const customer of state.overview?.customers ?? []) {
    options.push(renderOption(customer.id, customer.name, state.reportingFilter.customerId === customer.id));
  }
  return options.join("");
}

export function renderArchiveCustomerOptions(): string {
  const options = ['<option value="">alle Kunden</option>'];
  for (const customer of state.overview?.customers ?? []) {
    options.push(renderOption(customer.id, customer.name, state.archiveFilter.customerId === customer.id));
  }
  return options.join("");
}

export function renderReportingSiteOptions(): string {
  const options = ['<option value="">alle Standorte</option>'];
  for (const site of state.overview?.sites ?? []) {
    options.push(renderOption(site.id, site.siteName, state.reportingFilter.siteId === site.id));
  }
  return options.join("");
}

export function renderArchiveSiteOptions(): string {
  const options = ['<option value="">alle Standorte</option>'];
  for (const site of state.overview?.sites ?? []) {
    options.push(renderOption(site.id, site.siteName, state.archiveFilter.siteId === site.id));
  }
  return options.join("");
}

export function renderReportingCameraOptions(): string {
  const options = ['<option value="">alle Kameras</option>'];
  for (const site of state.overview?.sites ?? []) {
    for (const device of site.devices.filter((entry) => entry.type.includes("camera"))) {
      options.push(renderOption(device.id, `${site.siteName} | ${device.name}`, state.reportingFilter.cameraId === device.id));
    }
  }
  return options.join("");
}

export function renderArchiveCameraOptions(): string {
  const options = ['<option value="">alle Kameras</option>'];
  for (const site of state.overview?.sites ?? []) {
    for (const device of site.devices.filter((entry) => entry.type.includes("camera"))) {
      options.push(renderOption(device.id, `${site.siteName} | ${device.name}`, state.archiveFilter.cameraId === device.id));
    }
  }
  return options.join("");
}

export function renderReportingAlarmTypeOptions(): string {
  const options = ['<option value="">alle Alarmtypen</option>'];
  for (const value of reportingAlarmTypeOptions) {
    options.push(renderOption(value, value, state.reportingFilter.alarmType === value));
  }
  return options.join("");
}

export function renderArchiveAlarmTypeOptions(): string {
  const options = ['<option value="">alle Alarmtypen</option>'];
  for (const value of reportingAlarmTypeOptions) {
    options.push(renderOption(value, value, state.archiveFilter.alarmType === value));
  }
  return options.join("");
}

export function renderArchiveAssessmentOptions(): string {
  const options = ['<option value="">alle Bewertungen</option>'];
  for (const value of ["pending", "confirmed_incident", "false_positive"] as const) {
    options.push(renderOption(value, value, state.archiveFilter.assessmentStatus === value));
  }
  return options.join("");
}

export function renderArchiveClosureReasonOptions(): string {
  return ['<option value="">alle Abschlussgruende</option>', ...((state.catalogs?.closureReasons ?? []).map((item) => renderOption(item.id, item.label, state.archiveFilter.closureReasonId === item.id)))].join("");
}

export function renderReportingDisturbanceTypeOptions(): string {
  const options = ['<option value="">alle Stoerungstypen</option>'];
  for (const value of reportingDisturbanceTypeOptions) {
    options.push(renderOption(value, value, state.reportingFilter.disturbanceType === value));
  }
  return options.join("");
}

export function renderArchiveDisturbanceTypeOptions(): string {
  const options = ['<option value="">alle Stoerungstypen</option>'];
  for (const value of reportingDisturbanceTypeOptions) {
    options.push(renderOption(value, value, state.archiveFilter.disturbanceType === value));
  }
  return options.join("");
}

export function renderOptions<TValue extends string>(values: readonly TValue[], selectedValue: TValue): string {
  return values.map((value) => renderOption(value, value, value === selectedValue)).join("");
}

export function renderOption(value: string, label: string, selected: boolean): string {
  return `<option value="${value}"${selected ? " selected" : ""}>${label}</option>`;
}

export function renderCatalogOptions(items: Array<{ id: string; label: string }>, emptyLabel: string): string {
  if (items.length === 0) {
    return `<option value="">${emptyLabel}</option>`;
  }
  return [`<option value="">${emptyLabel}</option>`, ...items.map((item, index) => renderOption(item.id, item.label, index === 0))].join("");
}

export function renderReportingMetricFacts(metrics: Array<{ label: string; value: number }>): string {
  return metrics.map((metric) => `<div><dt>${metric.label}</dt><dd>${metric.value}</dd></div>`).join("");
}

export function renderDurationFacts(metrics: Array<{ label: string; sampleCount: number; averageSeconds?: number; maximumSeconds?: number; totalSeconds?: number }>): string {
  return `
    <dl class="facts compact-gap">
      ${metrics.map((metric) => `
        <div><dt>${metric.label}</dt><dd>${metric.sampleCount > 0 ? `${formatDuration(metric.averageSeconds ?? 0)} Ã˜` : "-"}</dd></div>
        <div><dt>${metric.label} Samples</dt><dd>${metric.sampleCount}</dd></div>
        <div><dt>${metric.label} Max</dt><dd>${metric.maximumSeconds !== undefined ? formatDuration(metric.maximumSeconds) : "-"}</dd></div>
        ${metric.totalSeconds !== undefined ? `<div><dt>${metric.label} Gesamt</dt><dd>${formatDuration(metric.totalSeconds)}</dd></div>` : ""}
      `).join("")}
    </dl>
  `;
}

export function renderReportingGroups(title: string, groups: ReportingGroupBucket[]): string {
  return `
    <div class="stack compact">
      <h4>${title}</h4>
      ${groups.length > 0
        ? `<ul class="plain-list">${groups.map((group) => `<li><strong>${group.label}</strong> | ${group.value}</li>`).join("")}</ul>`
        : `<p class="empty">Keine Gruppierungsergebnisse fuer diese Auswahl.</p>`}
    </div>
  `;
}

export function readActiveAssignment(detail: AlarmCaseDetail) {
  return [...detail.assignments].reverse().find((entry) => entry.assignmentStatus === "active");
}

export function formatActiveAssignmentSummary(
  assignment:
    | {
        userId: string;
        displayName?: string;
        assignedAt: string;
      }
    | undefined
): string {
  if (!assignment) {
    return "-";
  }

  const label = assignment.displayName ?? assignment.userId;
  return `${label} seit ${formatTimestamp(assignment.assignedAt)}`;
}

export function renderInstructionProfile(profile: AlarmWorkflowProfile): string {
  return `
    <article class="subcard stack compact">
      <div class="actions">
        <strong>${profile.label}</strong>
        <span class="pill">${profile.timeContext}</span>
      </div>
      <p class="muted">${profile.siteName}${profile.specialContextLabel ? ` | ${profile.specialContextLabel}` : ""}</p>
      ${profile.description ? `<p>${profile.description}</p>` : ""}
      <ol class="plain-list">
        ${profile.steps.map((step) => `<li>${step.title}${step.isRequiredByDefault ? " | pflichtvorbereitet" : ""}${step.actionTypeLabel ? ` | ${step.actionTypeLabel}` : ""}</li>`).join("")}
      </ol>
    </article>
  `;
}

export function renderSitePlanWorkspace(siteId: string, context: "site" | "alarm" | "monitoring"): string {
  const site = state.overview?.sites.find((entry) => entry.id === siteId);
  if (!site || site.plans.length === 0) {
    return context === "site"
      ? `<p class="muted">Fuer diesen Standort sind noch keine Objekt- oder Kameraplaene hinterlegt.</p>`
      : "";
  }

  const highlightedDevice = resolveHighlightedPlanDevice(siteId, site);
  const planContextInput: Parameters<typeof resolveSitePlanContext>[0] = {
    site,
    openAlarms: state.openAlarms,
    openDisturbances: state.openDisturbances
  };
  const selectedPlanId = state.selectedSitePlanIds[siteId];
  if (selectedPlanId) {
    planContextInput.selectedPlanId = selectedPlanId;
  }
  const selectedMarkerId = selectedPlanId ? state.selectedSitePlanMarkerIds[selectedPlanId] : undefined;
  if (selectedMarkerId) {
    planContextInput.selectedMarkerId = selectedMarkerId;
  }
  if (highlightedDevice?.id) {
    planContextInput.highlightedDeviceId = highlightedDevice.id;
  }

  const planContext = resolveSitePlanContext(planContextInput);
  const selectedPlan = planContext.selectedPlan;
  if (!selectedPlan) {
    return "";
  }

  const zoom = state.selectedSitePlanZooms[selectedPlan.id] ?? 1;
  const assetUrl = resolveSitePlanAssetUrl(selectedPlan);

  return `
    <div class="stack compact plan-workspace">
      <div class="actions">
        ${site.plans.map((plan) => `
          <button
            type="button"
            class="secondary site-plan-select-button${selectedPlan.id === plan.id ? " selected" : ""}"
            data-site-id="${siteId}"
            data-plan-id="${plan.id}"
          >${plan.name}</button>
        `).join("")}
      </div>
      <div class="actions">
        <span class="pill">${selectedPlan.kind}</span>
        <span class="muted">Asset ${selectedPlan.assetName}</span>
        <span class="muted">Marker ${selectedPlan.markers.length}</span>
        ${planContext.cameraMarkerCount > 0 ? `<span class="muted">Kamera-Marker ${planContext.cameraMarkerCount}</span>` : ""}
        ${highlightedDevice ? `<span class="pill priority-high">Bezug ${highlightedDevice.name}</span>` : ""}
        <span class="muted">Zoom ${Math.round(zoom * 100)}%</span>
        <button type="button" class="secondary site-plan-zoom-button" data-plan-id="${selectedPlan.id}" data-direction="out">-</button>
        <button type="button" class="secondary site-plan-zoom-button" data-plan-id="${selectedPlan.id}" data-direction="in">+</button>
      </div>
      <section class="site-plan-stage" aria-label="Plan ${selectedPlan.name}">
        <div class="site-plan-viewport" data-ui-preserve-scroll="site-plan:${siteId}:${selectedPlan.id}">
          <div class="site-plan-surface" style="width:${Math.round(960 * zoom)}px">
            <img class="site-plan-image" src="${assetUrl}" alt="Planbild ${selectedPlan.name}" />
            <div class="site-plan-grid"></div>
          ${selectedPlan.markers.map((marker) => renderSitePlanMarker(site, selectedPlan, marker, planContext.selectedMarker?.id, highlightedDevice?.id)).join("")}
          </div>
        </div>
      </section>
      ${selectedPlan.markers.length === 0
        ? renderEmptyState("Dieser Plan ist hinterlegt, enthaelt aktuell aber noch keine Kamera- oder Orientierungspunkte.")
        : renderSelectedSitePlanMarkerContext(site, selectedPlan, planContext, context)}
      ${planContext.unassignedCameraMarkerCount > 0
        ? renderNotice(`${planContext.unassignedCameraMarkerCount} Kamera-Marker sind aktuell noch keinem Geraet zugeordnet.`)
        : ""}
      <p class="muted">
        ${context === "alarm"
          ? "Der Plan nutzt den aktuellen Alarmkontext und hebt die relevante Kamera oder das relevante Geraet hervor, wenn eine Zuordnung vorhanden ist."
          : context === "monitoring"
            ? "Der Plan nutzt den aktuellen Stoerungskontext und hebt das betroffene Geraet hervor, wenn eine Zuordnung vorhanden ist."
            : "Standortplaene sind direkt im Standortkontext sichtbar und koennen zwischen mehreren hinterlegten Varianten umgeschaltet werden."}
      </p>
    </div>
  `;
}

function renderSitePlanMarker(
  site: MasterDataOverview["sites"][number],
  plan: SitePlan,
  marker: CameraPlanMarker,
  selectedMarkerId?: string,
  highlightedDeviceId?: string
): string {
  const device = marker.deviceId ? site.devices.find((entry) => entry.id === marker.deviceId) : undefined;
  const isSelected = marker.id === selectedMarkerId;
  const isHighlighted = Boolean(highlightedDeviceId && marker.deviceId === highlightedDeviceId);
  const left = clamp(marker.x, 0, 100);
  const top = clamp(marker.y, 0, 100);

  return `
    <button
      type="button"
      class="site-plan-marker marker-type-${marker.markerType}${isSelected ? " selected" : ""}${isHighlighted ? " highlighted" : ""}${device ? " is-actionable" : ""}"
      style="left:${left}%;top:${top}%"
      title="${marker.label}${device ? ` | ${device.name}` : " | ohne Geraetezuordnung"}${isHighlighted ? " | aktueller Bezug" : ""}"
      aria-label="${plan.name}: ${marker.label}"
      data-site-id="${site.id}"
      data-plan-id="${plan.id}"
      data-marker-id="${marker.id}"
    >
      <span class="site-plan-marker-core"></span>
      <span class="site-plan-marker-label">${marker.label}${device ? ` | ${device.name}` : ""}</span>
    </button>
  `;
}

function resolveSitePlanAssetUrl(plan: SitePlan): string {
  const knownAssets: Record<string, string> = {
    "yard-overview.png": "./src/assets/site-plans/yard-overview.svg"
  };

  return knownAssets[plan.assetName] ?? buildPlanPlaceholderDataUrl(plan);
}

function buildPlanPlaceholderDataUrl(plan: SitePlan): string {
  const escapedTitle = escapeHtml(plan.name);
  const escapedAsset = escapeHtml(plan.assetName);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#f7f2e8" />
          <stop offset="100%" stop-color="#ece3d2" />
        </linearGradient>
      </defs>
      <rect width="960" height="640" rx="36" fill="url(#bg)" />
      <rect x="64" y="64" width="832" height="512" rx="28" fill="rgba(255,255,255,0.65)" stroke="rgba(29,42,47,0.12)" stroke-width="4" />
      <path d="M180 184 H780" stroke="rgba(29,42,47,0.12)" stroke-width="16" stroke-linecap="round" />
      <path d="M250 420 H705" stroke="rgba(29,42,47,0.12)" stroke-width="16" stroke-linecap="round" />
      <path d="M312 184 V420" stroke="rgba(29,42,47,0.12)" stroke-width="16" stroke-linecap="round" />
      <path d="M628 184 V420" stroke="rgba(29,42,47,0.12)" stroke-width="16" stroke-linecap="round" />
      <text x="88" y="118" fill="#1d2a2f" font-family="Segoe UI, sans-serif" font-size="36" font-weight="700">${escapedTitle}</text>
      <text x="88" y="158" fill="#56666b" font-family="Segoe UI, sans-serif" font-size="20">Kein dediziertes Planbild vorhanden. Platzhalter fuer ${escapedAsset}.</text>
      <text x="88" y="550" fill="#56666b" font-family="Segoe UI, sans-serif" font-size="18">Markerpositionen werden trotzdem operativ auf dem Plan verankert dargestellt.</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function resolveHighlightedPlanDevice(
  siteId: string,
  site: MasterDataOverview["sites"][number]
): { id: string; name: string } | undefined {
  if (state.selectedAlarmDetail?.alarmCase.siteId === siteId && state.selectedAlarmDetail.alarmCase.primaryDeviceId) {
    const device = site.devices.find((entry) => entry.id === state.selectedAlarmDetail?.alarmCase.primaryDeviceId);
    return {
      id: state.selectedAlarmDetail.alarmCase.primaryDeviceId,
      name: device?.name ?? state.selectedAlarmDetail.alarmCase.primaryDeviceId
    };
  }

  if (state.selectedMonitoringDetail?.site.id === siteId && state.selectedMonitoringDetail.device) {
    return {
      id: state.selectedMonitoringDetail.device.id,
      name: state.selectedMonitoringDetail.device.name
    };
  }

  return undefined;
}

function renderSelectedSitePlanMarkerContext(
  site: MasterDataOverview["sites"][number],
  plan: SitePlan,
  planContext: ReturnType<typeof resolveSitePlanContext>,
  context: "site" | "alarm" | "monitoring"
): string {
  const selectedMarker = planContext.selectedMarker;
  if (!selectedMarker) {
    return renderEmptyState("Planpunkte werden sichtbar, sobald fuer diesen Plan Marker hinterlegt sind.");
  }

  const selectedDevice = planContext.selectedDevice;
  const firstAlarm = planContext.matchingAlarms[0];
  const firstDisturbance = planContext.matchingDisturbances[0];

  return `
    <article class="subcard stack compact site-plan-context-panel">
      ${renderSectionHeader(selectedMarker.label, {
        level: "h4",
        pills: [
          renderPill(selectedMarker.markerType),
          renderPill(selectedDevice ? "geraet-zugeordnet" : "ohne geraet"),
          ...(selectedMarker.deviceId ? [renderPill(`Alarm ${planContext.matchingAlarms.length}`), renderPill(`Stoerung ${planContext.matchingDisturbances.length}`)] : [])
        ]
      })}
      <p class="muted">Standort ${site.siteName} | Plan ${plan.name} | Position ${Math.round(selectedMarker.x)} / ${Math.round(selectedMarker.y)}</p>
      <dl class="facts compact-gap">
        <div><dt>Marker-Typ</dt><dd>${selectedMarker.markerType}</dd></div>
        <div><dt>Geraet</dt><dd>${selectedDevice ? selectedDevice.name : selectedMarker.deviceId ?? "-"}</dd></div>
        <div><dt>Geraete-Status</dt><dd>${selectedDevice ? selectedDevice.status : "nicht zugeordnet"}</dd></div>
        <div><dt>Netzwerk</dt><dd>${selectedDevice?.networkAddress ?? "-"}</dd></div>
      </dl>
      ${selectedMarker.deviceId && !selectedDevice
        ? renderNotice("Die Marker-Zuordnung verweist auf ein Geraet, das im aktuellen Standortkontext nicht mehr vorhanden ist.", "error")
        : !selectedMarker.deviceId && selectedMarker.markerType === "camera"
          ? renderNotice("Dieser Kamerapunkt ist noch keinem konkreten Geraet zugeordnet.")
          : ""}
      <div class="actions">
        ${context !== "site" ? `<button type="button" class="secondary site-plan-open-site-details-button" data-site-id="${site.id}">Standortdetails</button>` : ""}
        ${firstAlarm ? `<button type="button" class="secondary site-plan-open-alarm-button" data-alarm-case-id="${firstAlarm.id}">Alarmkontext oeffnen</button>` : ""}
        ${firstDisturbance ? `<button type="button" class="secondary site-plan-open-disturbance-button" data-disturbance-id="${firstDisturbance.id}">Stoerungsdetail oeffnen</button>` : ""}
      </div>
      ${selectedMarker.deviceId && !firstAlarm && !firstDisturbance
        ? `<p class="muted">Fuer dieses zugeordnete Geraet liegt aktuell kein offener Alarm- oder Stoerungskontext vor.</p>`
        : !selectedMarker.deviceId
          ? `<p class="muted">Dieser Punkt dient aktuell der Orientierung im Standortplan und hat noch keinen direkten operativen Sprungpfad.</p>`
          : ""}
    </article>
  `;
}

export function projectMarkerPosition(latitude: number, longitude: number): { left: number; top: number } {
  const bounds = {
    minLongitude: 5.4,
    maxLongitude: 15.6,
    minLatitude: 47.0,
    maxLatitude: 55.2
  };

  const normalizedLeft = ((longitude - bounds.minLongitude) / (bounds.maxLongitude - bounds.minLongitude));
  const normalizedTop = 1 - ((latitude - bounds.minLatitude) / (bounds.maxLatitude - bounds.minLatitude));
  const left = 18 + (normalizedLeft * 64);
  const top = 6 + (normalizedTop * 88);

  return {
    left: clamp(left, 18, 82),
    top: clamp(top, 6, 94)
  };
}

export function listMapSiteAlarms(siteId: string) {
  return state.openAlarms.filter((alarm) => alarm.siteId === siteId);
}

export function listMapSiteDisturbances(siteId: string): MonitoringPipelineItem[] {
  return state.openDisturbances.filter((disturbance) => disturbance.siteId === siteId);
}
