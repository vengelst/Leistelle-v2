/**
 * Root-View fuer den Leitstellen-Arbeitsbereich.
 *
 * Die Datei schaltet zwischen den Leitstellen-Modi wie Arbeitsplatz,
 * Alarmpipeline, Stoerungspipeline, dediziertem Operator-Screen und Wallboard
 * um.
 */
import { state, type LeitstelleMode } from "../state.js";
import { hrefForLeitstelleMode } from "../navigation/routes.js";
import { renderEmptyState, renderPill, renderSectionHeader } from "./common.js";
import {
  renderAlarmDetailSection,
  renderPipelineFilterForm,
  renderPipelineList
} from "./alarm.js";
import {
  renderMonitoringDetailSection,
  renderMonitoringFilterForm,
  renderMonitoringPipelineList
} from "./monitoring.js";
import { renderOperatorScreen } from "./operator-screen.js";
import { renderWallboardScreen } from "./wallboard.js";

export function renderOperatorWorkspace(): string {
  if (!state.session) {
    return renderEmptyState("Nach dem Login steht der Leitstellen-Arbeitsbereich fuer Alarm- und Stoerungsbearbeitung bereit.");
  }

  const activeContext = state.selectedAlarmDetail
    ? "alarm"
    : state.selectedMonitoringDetail
      ? "monitoring"
      : null;
  const alarmPipelineBusy = Boolean(state.pendingOperations["open-alarms"]);
  const monitoringPipelineBusy = Boolean(state.pendingOperations["open-disturbances"]);
  const mode = state.leitstelleMode;

  if (mode === "operator") {
    return renderOperatorScreen();
  }

  if (mode === "wallboard") {
    return renderWallboardScreen();
  }

  return `
    <section class="operator-workspace" data-operator-keyboard-root="true">
      <aside class="operator-sidebar">
        <article class="subcard stack compact operator-mode-card">
          ${renderSectionHeader("Leitstellenmodus", {
            pills: [renderPill(modeLabel(mode))]
          })}
          <div class="operator-mode-nav">
            ${renderModeButton("overview", "Arbeitsplatz", mode)}
            ${renderModeButton("alarms", "Alarm-Pipeline", mode)}
            ${renderModeButton("disturbances", "Stoerungspipeline", mode)}
            ${renderModeButton("operator", "Alarmannahme-Screen", mode)}
            ${renderModeButton("wallboard", "Wallboard", mode)}
          </div>
          <div class="actions">
            <a class="button-link secondary" href="${hrefForLeitstelleMode("alarms")}" target="_blank" rel="noopener noreferrer">Alarm-Pipeline im Tab</a>
            <a class="button-link secondary" href="${hrefForLeitstelleMode("disturbances")}" target="_blank" rel="noopener noreferrer">Stoerungen im Tab</a>
            <a class="button-link secondary" href="${hrefForLeitstelleMode("operator")}" target="_blank" rel="noopener noreferrer">Alarmannahme im Tab</a>
            <a class="button-link secondary" href="${hrefForLeitstelleMode("wallboard")}" target="_blank" rel="noopener noreferrer">Wallboard im Tab</a>
          </div>
        </article>
        ${mode !== "disturbances" ? `
          <article
            class="subcard stack compact operator-lane operator-focus-zone"
            id="operator-list-zone"
            tabindex="-1"
            role="region"
            aria-label="Alarmliste"
            aria-keyshortcuts="Control+Shift+1 Control+Shift+ArrowDown Control+Shift+ArrowUp"
            data-operator-focus-zone="list"
          >
            ${renderSectionHeader("Alarm-Pipeline", {
              pills: [renderPill(`${state.openAlarms.length} offen`), ...(alarmPipelineBusy ? [renderPill("laedt")] : [])]
            })}
            <p class="muted">Alarmfaelle bleiben fachlich getrennt und sind als direkter Leitstellenmodus erreichbar.</p>
            <p class="muted operator-shortcut-hint">Tastatur: Strg+Umschalt+1/2/3 fuer Liste, Detail und Aktionen, Strg+Umschalt+Pfeil hoch/runter fuer die Alarmreihe, Strg+Umschalt+Eingabe zum Oeffnen, Strg+Umschalt+R zum Uebernehmen, Strg+Umschalt+Q zum Quittieren, Strg+Umschalt+E fuer Sicherheitsdienst, Strg+Umschalt+F fuer Filter und Esc zurueck zur Liste.</p>
            ${renderPipelineFilterForm()}
            <div class="operator-list-panel" data-ui-preserve-scroll="operator-alarm-list">
              ${renderPipelineList()}
            </div>
          </article>
        ` : ""}
        ${mode !== "alarms" ? `
          <article class="subcard stack compact operator-lane">
            ${renderSectionHeader("Stoerungspipeline", {
              pills: [renderPill(`${state.openDisturbances.length} offen`), ...(monitoringPipelineBusy ? [renderPill("laedt")] : [])]
            })}
            <p class="muted">Technische Stoerungen bleiben separat erreichbar, aber im selben Leitstellen-Arbeitsmodus.</p>
            ${renderMonitoringFilterForm()}
            <div class="operator-list-panel" data-ui-preserve-scroll="operator-monitoring-list">
              ${renderMonitoringPipelineList()}
            </div>
          </article>
        ` : ""}
      </aside>
      <section class="operator-detail">
        <article
          class="subcard stack compact operator-context-card operator-focus-zone"
          id="operator-detail-zone"
          tabindex="-1"
          role="region"
          aria-label="Aktiver Alarmkontext"
          aria-keyshortcuts="Control+Shift+2"
          data-operator-focus-zone="detail"
        >
          ${renderSectionHeader("Aktiver Bearbeitungskontext", {
            pills: [renderPill(activeContext === "alarm" ? "Alarm" : activeContext === "monitoring" ? "Stoerung" : "Auswahl offen")]
          })}
          <p class="muted">
            ${activeContext === "alarm"
              ? "Die Alarm-Detailansicht zeigt Bewertung, Status, Massnahmen, Einsatzanweisungen und Kommentare in einem zusammenhaengenden Arbeitsfluss."
              : activeContext === "monitoring"
                ? "Die Stoerungs-Detailansicht zeigt technischen Kontext, Historie, Notizen und Serviceuebergabe in derselben Arbeitsflaeche."
                : "Links einen Alarm oder eine Stoerung waehlen, um rechts die passende operative Detailsicht zu oeffnen."}
          </p>
        </article>
        <div class="operator-detail-panel" data-ui-preserve-scroll="operator-detail-panel">
          ${activeContext === "alarm"
            ? renderAlarmDetailSection()
            : activeContext === "monitoring"
              ? renderMonitoringDetailSection()
              : renderOperatorWorkspacePlaceholder()}
        </div>
      </section>
    </section>
  `;
}

function renderModeButton(mode: LeitstelleMode, label: string, activeMode: LeitstelleMode): string {
  return `
    <button
      type="button"
      class="secondary operator-mode-button${mode === activeMode ? " is-active" : ""}"
      data-leitstelle-mode="${mode}"
    >${label}</button>
  `;
}

function modeLabel(mode: LeitstelleMode): string {
  switch (mode) {
    case "alarms":
      return "Alarm-Pipeline";
    case "disturbances":
      return "Stoerungspipeline";
    case "operator":
      return "Alarmannahme-Screen";
    case "wallboard":
      return "Wallboard";
    default:
      return "Arbeitsplatz";
  }
}

function renderOperatorWorkspacePlaceholder(): string {
  return `
    <section class="stack section">
      <article class="subcard stack compact">
        <h3>Bearbeitung vorbereiten</h3>
        <p class="muted">Die haeufigsten Operator-Aufgaben laufen jetzt ueber einen gemeinsamen Arbeitsbereich:</p>
        <ul class="plain-list">
          <li>Offenen Alarm oder offene Stoerung links auswaehlen</li>
          <li>Rechts direkt im Kontext bewerten, kommentieren oder quittieren</li>
          <li>Massnahmen und Einsatzanweisungen ohne Bereichswechsel nutzen</li>
        </ul>
      </article>
    </section>
  `;
}
