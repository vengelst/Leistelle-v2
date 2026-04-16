/**
 * Rendert Listen, Filter und Editor fuer die operative Schichtplanung.
 */
import { state, shiftPlanningPeriodOptions, shiftPlanningStateOptions } from "../state.js";
import { escapeHtml, formatDateTimeLocalValue, formatTimestamp } from "../utils.js";
import { formatUserRoleLabel, formatUserStatusLabel, renderEmptyState, renderPill, renderSectionHeader } from "./common.js";

export function renderShiftPlanningSection(): string {
  if (!state.session) {
    return renderEmptyState("Nach dem Login steht die operative Schichtplanung mit geplanter Besetzung und Ist-Praesenz bereit.");
  }

  const overview = state.shiftPlanning;
  const selectedShift = overview?.shifts.find((shift) => shift.id === state.selectedShiftPlanningShiftId);
  const users = overview?.assignableUsers ?? [];
  const canEdit = state.session.user.roles.includes("administrator") || state.session.user.roles.includes("leitstellenleiter");

  return `
    <section class="stack">
      <article class="subcard stack compact">
        ${renderSectionHeader("Schichtplanung", {
          subtitle: "Plan-Zustand und Ist-Praesenz bleiben getrennt: Schichten bilden die geplante Besetzung, Status und aktive Sessions zeigen die aktuelle operative Verfuegbarkeit.",
          actions: `<button type="button" id="refresh-shift-planning-button" class="secondary">Schichtplanung aktualisieren</button>`
        })}
        <form id="shift-planning-filter-form" class="stack" data-ui-preserve-form="true">
          <div class="actions">
            <button type="submit" class="secondary">Schichten laden</button>
            <button type="button" id="shift-planning-reset-button" class="secondary">Filter zuruecksetzen</button>
          </div>
          <div class="detail-grid">
            <label class="field"><span>Zeitraum</span><select name="period">${shiftPlanningPeriodOptions.map((value) => renderOption(value, value, state.shiftPlanningFilter.period === value)).join("")}</select></label>
            <label class="field"><span>Von</span><input name="dateFrom" type="date" value="${escapeHtml(state.shiftPlanningFilter.dateFrom ?? "")}" /></label>
            <label class="field"><span>Bis</span><input name="dateTo" type="date" value="${escapeHtml(state.shiftPlanningFilter.dateTo ?? "")}" /></label>
            <label class="field"><span>Schichtstatus</span><select name="planningState">${renderShiftStateOptions()}</select></label>
            <label class="field"><span>Benutzer</span><select name="userId">${renderShiftUserOptions()}</select></label>
          </div>
        </form>
      </article>
      ${overview
        ? `
          <section class="detail-grid">
            <article class="subcard stack compact">
              <h4>Zeitraum</h4>
              <p class="muted">${overview.range.label}</p>
              <dl class="facts compact-gap">
                <div><dt>Geplant</dt><dd>${overview.summary.plannedShifts}</dd></div>
                <div><dt>Laufend</dt><dd>${overview.summary.runningShifts}</dd></div>
                <div><dt>Abgeschlossen</dt><dd>${overview.summary.completedShifts}</dd></div>
                <div><dt>Besetzungen</dt><dd>${overview.summary.staffedAssignments}</dd></div>
                <div><dt>Unbesetzte Schichten</dt><dd>${overview.summary.unstaffedShifts}</dd></div>
              </dl>
            </article>
            <article class="subcard stack compact">
              <h4>Planung pflegen</h4>
              ${canEdit
                ? `
                  <form id="shift-planning-form" class="stack" data-ui-preserve-form="true">
                    <input type="hidden" name="id" value="${escapeHtml(selectedShift?.id ?? "")}" />
                    <label class="field"><span>Bezeichnung</span><input name="title" required value="${escapeHtml(selectedShift?.title ?? "")}" placeholder="z. B. Fruehschicht Leitstelle" /></label>
                    <div class="detail-grid">
                      <label class="field"><span>Start</span><input name="startsAt" type="datetime-local" required value="${escapeHtml(formatDateTimeLocalValue(selectedShift?.startsAt))}" /></label>
                      <label class="field"><span>Ende</span><input name="endsAt" type="datetime-local" required value="${escapeHtml(formatDateTimeLocalValue(selectedShift?.endsAt))}" /></label>
                    </div>
                    <label class="field">
                      <span>Besetzung</span>
                      <select name="assignmentUserIds" multiple size="${Math.min(Math.max(users.length, 4), 8)}">
                        ${users.map((user) => renderOption(user.id, `${user.displayName} | ${formatUserRoleLabel(user.primaryRole)} | ${user.presence.hasActiveSession ? "online" : "ohne Session"}`, Boolean(selectedShift?.assignments.some((assignment) => assignment.userId === user.id)))).join("")}
                      </select>
                    </label>
                    <label class="field"><span>Uebergabe / Schichtnotiz</span><textarea name="handoverNote" rows="4" placeholder="Kurze operative Uebergabe, Besonderheiten, offene Hinweise.">${escapeHtml(selectedShift?.handoverNote ?? "")}</textarea></label>
                    <div class="actions">
                      <button type="submit">${selectedShift ? "Schicht aktualisieren" : "Schicht anlegen"}</button>
                      <button type="button" id="shift-planning-editor-reset-button" class="secondary">Formular leeren</button>
                    </div>
                  </form>
                `
                : `<p class="muted">Schichten sind operativ sichtbar; Pflege bleibt auf Leitung und Administration begrenzt.</p>`}
              ${selectedShift?.handoverNotedAt
                ? `<p class="muted">Letzte Notizpflege: ${formatTimestamp(selectedShift.handoverNotedAt)}${selectedShift.handoverNotedByDisplayName ? ` durch ${escapeHtml(selectedShift.handoverNotedByDisplayName)}` : ""}</p>`
                : `<p class="muted">Schichtnotizen bleiben bewusst knapp und ohne eigene Aufgaben- oder Workflow-Logik.</p>`}
            </article>
          </section>
          ${renderShiftCards()}
        `
        : renderEmptyState("Noch keine Schichtplanung geladen.")}
    </section>
  `;
}

function renderShiftCards(): string {
  const overview = state.shiftPlanning;
  if (!overview || overview.shifts.length === 0) {
    return renderEmptyState("Keine Schichten im ausgewaehlten Zeitraum vorhanden.");
  }

  return `
    <section class="stack section">
      ${overview.shifts.map((shift) => `
        <article class="subcard stack compact shift-card">
          ${renderSectionHeader(shift.title, {
            level: "h4",
            pills: [renderPill(formatShiftStateLabel(shift.planningState)), renderPill(`${shift.assignments.length} Besetzung`)],
            actions: `<button type="button" class="secondary shift-edit-button" data-shift-id="${shift.id}">Bearbeiten</button>`
          })}
          <dl class="facts compact-gap">
            <div><dt>Start</dt><dd>${formatTimestamp(shift.startsAt)}</dd></div>
            <div><dt>Ende</dt><dd>${formatTimestamp(shift.endsAt)}</dd></div>
            <div><dt>Planstatus</dt><dd>${formatShiftStateLabel(shift.planningState)}</dd></div>
            <div><dt>Notiz</dt><dd>${shift.handoverNote ? "vorhanden" : "-"}</dd></div>
          </dl>
          <article class="subcard stack compact shift-subcard">
            <h5>Geplante Besetzung und Ist-Praesenz</h5>
            ${shift.assignments.length > 0
              ? `<ul class="plain-list">${shift.assignments.map((assignment) => `
                <li>
                  <strong>${escapeHtml(assignment.displayName)}</strong>
                  <span class="shift-assignment-meta">
                    ${renderPill(`Plan ${formatUserRoleLabel(assignment.primaryRole)}`)}
                    ${renderPill(`Ist ${formatUserStatusLabel(assignment.presence.currentStatus)}`)}
                    ${renderPill(assignment.presence.hasActiveSession ? "aktive Session" : "keine Session")}
                  </span>
                  <br/>
                  Rollen: ${escapeHtml(assignment.roles.join(", "))} | Statuswechsel ${formatTimestamp(assignment.presence.lastStatusChangeAt)}
                  ${assignment.presence.pauseReason ? `<br/>Pausengrund: ${escapeHtml(assignment.presence.pauseReason)}` : ""}
                </li>
              `).join("")}</ul>`
              : renderEmptyState("Diese Schicht ist aktuell noch unbesetzt.")}
          </article>
          <article class="subcard stack compact shift-subcard">
            <h5>Uebergabe</h5>
            ${shift.handoverNote
              ? `<p>${escapeHtml(shift.handoverNote)}</p><p class="muted">${shift.handoverNotedAt ? formatTimestamp(shift.handoverNotedAt) : ""}${shift.handoverNotedByDisplayName ? ` | ${escapeHtml(shift.handoverNotedByDisplayName)}` : ""}</p>`
              : renderEmptyState("Noch keine Uebergabe- oder Schichtnotiz vorhanden.")}
          </article>
        </article>
      `).join("")}
    </section>
  `;
}

function renderShiftStateOptions(): string {
  const options = ['<option value="">alle Schichtzustaende</option>'];
  for (const value of shiftPlanningStateOptions) {
    options.push(renderOption(value, formatShiftStateLabel(value), state.shiftPlanningFilter.planningState === value));
  }
  return options.join("");
}

function renderShiftUserOptions(): string {
  const options = ['<option value="">alle Benutzer</option>'];
  for (const user of state.shiftPlanning?.assignableUsers ?? []) {
    options.push(renderOption(user.id, `${user.displayName} | ${formatUserRoleLabel(user.primaryRole)}`, state.shiftPlanningFilter.userId === user.id));
  }
  return options.join("");
}

function renderOption(value: string, label: string, selected: boolean): string {
  return `<option value="${escapeHtml(value)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function formatShiftStateLabel(stateValue: "planned" | "running" | "completed"): string {
  switch (stateValue) {
    case "planned":
      return "Geplant";
    case "running":
      return "Laufend";
    case "completed":
      return "Abgeschlossen";
    default:
      return stateValue;
  }
}
