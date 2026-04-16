/**
 * Rendert die read-only Grossansicht fuer Wallboard, Kennzahlen und Lagebild.
 */
import type { AlarmPipelineItem, DashboardMetric, ShiftRecord } from "@leitstelle/contracts";

import { state } from "../state.js";
import { escapeHtml, formatDuration, formatTimestamp } from "../utils.js";
import { renderEmptyState, renderPill, renderPriorityPill, renderSectionHeader } from "./common.js";

export function renderWallboardScreen(): string {
  const dashboard = state.dashboard;
  const shifts = buildWallboardShifts();

  return `
    <section class="wallboard-screen stack">
      <article class="subcard stack wallboard-hero-card">
        ${renderSectionHeader("Wallboard", {
          subtitle: "Read-only Uebersicht fuer separaten Bildschirm: offene Alarme, Stoerungen, kritische Standorte, Besetzung und laufende Schichten bleiben in einer ruhigen Grossansicht sichtbar.",
          pills: [
            renderPill("Leitstelle"),
            renderPill("Grossbildschirmmodus"),
            renderPill("Auto-Refresh aktiv")
          ]
        })}
      </article>
      <section class="wallboard-metrics">
        ${renderMetricCard(dashboard?.metrics.openAlarms, state.openAlarms.length, "Offene Alarme")}
        ${renderMetricCard(dashboard?.metrics.openDisturbances, state.openDisturbances.length, "Offene Stoerungen")}
        ${renderMetricCard(dashboard?.metrics.criticalSites, dashboard?.highlights.criticalSites.length ?? 0, "Kritische Standorte")}
        ${renderMetricCard(dashboard?.metrics.activeOperators, dashboard?.highlights.activeOperators.length ?? 0, "Aktive Operatoren")}
        ${renderMetricCard(null, shifts.length, "Sichtbare Schichten", "laufend / geplant")}
      </section>
      <section class="wallboard-grid">
        <article class="subcard stack compact wallboard-panel">
          ${renderSectionHeader("Alarmlage", {
            level: "h4",
            pills: [renderPill(`${state.openAlarms.length} offen`)]
          })}
          ${renderWallboardAlarmList()}
        </article>
        <article class="subcard stack compact wallboard-panel">
          ${renderSectionHeader("Stoerungslage", {
            level: "h4",
            pills: [renderPill(`${state.openDisturbances.length} offen`)]
          })}
          ${renderWallboardDisturbanceList()}
        </article>
        <article class="subcard stack compact wallboard-panel">
          ${renderSectionHeader("Kritische Standorte", {
            level: "h4",
            pills: [renderPill(`${dashboard?.highlights.criticalSites.length ?? 0} sichtbar`)]
          })}
          ${renderWallboardCriticalSites()}
        </article>
        <article class="subcard stack compact wallboard-panel">
          ${renderSectionHeader("Besetzung", {
            level: "h4",
            pills: [renderPill(`${dashboard?.highlights.activeOperators.length ?? 0} aktiv`)]
          })}
          ${renderWallboardOperatorList()}
        </article>
        <article class="subcard stack compact wallboard-panel wallboard-panel-wide">
          ${renderSectionHeader("Laufende und naechste Schichten", {
            level: "h4",
            pills: [renderPill(`${shifts.length} sichtbar`)]
          })}
          ${renderWallboardShifts(shifts)}
        </article>
      </section>
    </section>
  `;
}

function renderMetricCard(metric: DashboardMetric | null | undefined, fallbackValue: number, fallbackLabel: string, fallbackHint?: string): string {
  const value = metric?.value ?? fallbackValue;
  const label = metric?.label ?? fallbackLabel;
  const hint = metric?.hint ?? fallbackHint ?? "";
  return `
    <article class="subcard wallboard-metric-card">
      <span class="wallboard-metric-label">${escapeHtml(label)}</span>
      <strong class="wallboard-metric-value">${value}</strong>
      ${hint ? `<p class="muted">${escapeHtml(hint)}</p>` : ""}
    </article>
  `;
}

function renderWallboardAlarmList(): string {
  if (state.openAlarms.length === 0) {
    return renderEmptyState("Keine offenen Alarme im aktuellen Leitstellenfenster.");
  }

  return `
    <ul class="plain-list wallboard-list">
      ${state.openAlarms.slice(0, 6).map((alarm) => renderAlarmItem(alarm)).join("")}
    </ul>
  `;
}

function renderAlarmItem(alarm: AlarmPipelineItem): string {
  return `
    <li class="wallboard-list-item">
      <div class="wallboard-list-topline">
        <strong>${escapeHtml(alarm.title)}</strong>
        ${renderPriorityPill(alarm.priority)}
      </div>
      <p>${escapeHtml(alarm.siteName)} | ${escapeHtml(alarm.customerName)}</p>
      <p class="muted">
        Eingang ${formatTimestamp(alarm.receivedAt)}
        ${alarm.activeAssignment ? ` | zugewiesen an ${escapeHtml(alarm.activeAssignment.displayName)}` : " | noch frei"}
        ${alarm.primaryDeviceName ? ` | Geraet ${escapeHtml(alarm.primaryDeviceName)}` : ""}
      </p>
    </li>
  `;
}

function renderWallboardDisturbanceList(): string {
  if (state.openDisturbances.length === 0) {
    return renderEmptyState("Keine offenen Stoerungen im aktuellen Leitstellenfenster.");
  }

  return `
    <ul class="plain-list wallboard-list">
      ${state.openDisturbances.slice(0, 6).map((disturbance) => `
        <li class="wallboard-list-item">
          <div class="wallboard-list-topline">
            <strong>${escapeHtml(disturbance.title)}</strong>
            ${renderPriorityPill(disturbance.priority)}
          </div>
          <p>${escapeHtml(disturbance.siteName)} | ${escapeHtml(disturbance.customerName)}</p>
          <p class="muted">
            ${escapeHtml(disturbance.siteTechnicalStatus)} | seit ${formatTimestamp(disturbance.startedAt)} | Dauer ${formatDuration(disturbance.durationSeconds)}
          </p>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderWallboardCriticalSites(): string {
  const sites = state.dashboard?.highlights.criticalSites ?? [];
  if (sites.length === 0) {
    return renderEmptyState("Keine kritischen Standorte im Dashboard hervorgehoben.");
  }

  return `
    <ul class="plain-list wallboard-list">
      ${sites.slice(0, 6).map((site) => `
        <li class="wallboard-list-item">
          <div class="wallboard-list-topline">
            <strong>${escapeHtml(site.siteName)}</strong>
            ${renderPill(site.siteTechnicalStatus)}
          </div>
          <p>${escapeHtml(site.customerName)}</p>
          <p class="muted">Alarme ${site.openAlarmCount} | Stoerungen ${site.openDisturbanceCount}</p>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderWallboardOperatorList(): string {
  const operators = state.dashboard?.highlights.activeOperators ?? [];
  if (operators.length === 0) {
    return renderEmptyState("Keine aktiven Operatoren aus der vorhandenen Session-Sicht verfuegbar.");
  }

  return `
    <ul class="plain-list wallboard-list">
      ${operators.slice(0, 8).map((operator) => `
        <li class="wallboard-list-item">
          <div class="wallboard-list-topline">
            <strong>${escapeHtml(operator.displayName)}</strong>
            ${renderPill(formatWallboardUserStatus(operator.status))}
          </div>
          <p>${escapeHtml(formatWallboardUserRole(operator.primaryRole))}</p>
          <p class="muted">Statuswechsel ${formatTimestamp(operator.lastStatusChangeAt)}</p>
        </li>
      `).join("")}
    </ul>
  `;
}

function buildWallboardShifts(): ShiftRecord[] {
  const shifts = state.shiftPlanning?.shifts ?? [];
  const planningRank: Record<ShiftRecord["planningState"], number> = {
    running: 0,
    planned: 1,
    completed: 2
  };

  return [...shifts]
    .sort((left, right) => {
      const rankDelta = planningRank[left.planningState] - planningRank[right.planningState];
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return left.startsAt.localeCompare(right.startsAt);
    })
    .filter((shift) => shift.planningState !== "completed")
    .slice(0, 4);
}

function renderWallboardShifts(shifts: ShiftRecord[]): string {
  if (shifts.length === 0) {
    return renderEmptyState("Keine laufenden oder geplanten Schichten im aktuellen Planfenster.");
  }

  return `
    <div class="wallboard-shift-grid">
      ${shifts.map((shift) => `
        <article class="wallboard-shift-card">
          <div class="wallboard-list-topline">
            <strong>${escapeHtml(shift.title)}</strong>
            ${renderPill(shift.planningState === "running" ? "Laufend" : "Geplant")}
          </div>
          <p>${formatTimestamp(shift.startsAt)} bis ${formatTimestamp(shift.endsAt)}</p>
          <p class="muted">${shift.assignments.length > 0 ? `${shift.assignments.length} geplante Besetzung` : "Noch ohne Besetzung"}</p>
          ${shift.assignments.length > 0
            ? `<ul class="plain-list wallboard-assignment-list">${shift.assignments.slice(0, 4).map((assignment) => `
                <li>
                  <strong>${escapeHtml(assignment.displayName)}</strong>
                  <span class="muted">
                    ${escapeHtml(formatWallboardUserRole(assignment.primaryRole))}
                    | ${escapeHtml(formatWallboardUserStatus(assignment.presence.currentStatus))}
                    | ${assignment.presence.hasActiveSession ? "aktive Session" : "keine Session"}
                  </span>
                </li>
              `).join("")}</ul>`
            : ""}
          ${shift.handoverNote ? `<p class="muted wallboard-note">${escapeHtml(shift.handoverNote)}</p>` : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function formatWallboardUserRole(role: string): string {
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

function formatWallboardUserStatus(status: string): string {
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
