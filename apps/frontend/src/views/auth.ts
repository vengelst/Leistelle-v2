import type { UserAdminRecord, UserRole } from "@leitstelle/contracts";

import { state, userAdministrationRoleOptions } from "../state.js";
import { escapeHtml, formatTimestamp } from "../utils.js";
import { formatUserRoleLabel, formatUserStatusLabel, renderEmptyState, renderNotice, renderOption, renderPill, renderSectionHeader, renderUserFacts } from "./common.js";

export function renderLoginSection(): string {
  return `
    <form id="login-form" class="stack" data-ui-preserve-form="true">
      <label class="field"><span>Benutzername oder E-Mail</span><input name="identifier" autocomplete="username" required /></label>
      <label class="field"><span>Passwort</span><input type="password" name="password" autocomplete="current-password" required /></label>
      <button type="submit">Anmelden</button>
    </form>
    <p class="hint">Lokaler Login ueber die bestehende Identity-Schicht. Bootstrap-Logins bleiben fuer Entwicklung verfuegbar.</p>
    ${state.session ? renderUserFacts(state.session.user) : ""}
    ${state.session
      ? `
        <div class="actions">
          ${renderPill(`Status ${formatUserStatusLabel(state.session.user.status)}`)}
          <button
            type="button"
            class="secondary status-action-button"
            data-status-path="/api/v1/auth/status/active"
            data-success-message="Status auf aktiv gesetzt."
          >Aktiv</button>
          <button
            type="button"
            class="secondary status-action-button"
            data-status-path="/api/v1/auth/status/pause"
            data-success-message="Pause gesetzt."
          >Pause</button>
          <button
            type="button"
            class="secondary status-action-button"
            data-status-path="/api/v1/auth/status/resume"
            data-success-message="Pause beendet."
          >Resume</button>
          <button type="button" class="secondary logout-button">Logout</button>
        </div>
      `
      : ""}
  `;
}

export function renderStandaloneLoginScreen(): string {
  const pendingLabel = state.pendingOperations["login"] ?? state.pendingOperations["session"] ?? null;
  return `
    <main class="shell login-shell">
      <section class="login-shell-layout">
        <article class="login-hero-card">
          <p class="eyebrow">Leitstelle</p>
          <h1>Leitstellensoftware</h1>
          <p class="intro">Ein klarer Einstieg vor der geschuetzten Arbeitsoberflaeche. Nach dem Login bleiben Dashboard, Leitstelle, Standorte, Archiv und Einstellungen in derselben App verankert.</p>
          <div class="actions login-shell-actions">
            ${renderPill("Geschuetzter Zugang")}
            ${renderPill("Keine zweite Session-Logik")}
            <button type="button" id="theme-toggle-button" class="secondary theme-toggle-button">Theme umschalten</button>
          </div>
          ${pendingLabel ? renderNotice(pendingLabel, "default", true) : ""}
          <div class="login-shell-facts">
            <article class="subcard stack compact">
              <strong>Login</strong>
              <p class="muted">Benutzt die vorhandenen Auth-Pfade, Token-Speicherung und Session-Hydration.</p>
            </article>
            <article class="subcard stack compact">
              <strong>Kiosk-Modus</strong>
              <p class="muted">Steht nach dem Login als Shell-Praferenz innerhalb derselben App zur Verfuegung.</p>
            </article>
          </div>
        </article>
        <article class="login-card">
          ${renderSectionHeader("Anmelden", {
            subtitle: "Desktop-tauglicher Einstieg fuer den Leitstellenbetrieb mit klaren Feldern, Fokus und Tastaturbedienung."
          })}
          ${renderLoginSection()}
          <div class="login-meta">
            <p class="muted">Der Zugang fuehrt direkt in die bestehende App-Shell. Es wird kein separater Admin- oder Kiosk-Client aufgebaut.</p>
          </div>
        </article>
      </section>
      ${state.message ? renderNotice(state.message, "success") : ""}
      ${state.error ? renderNotice(state.error, "error") : ""}
    </main>
  `;
}

export function canAccessSettingsWorkspace(): boolean {
  return Boolean(state.session?.user.roles.some((role) => role === "administrator" || role === "leitstellenleiter"));
}

export function canAccessArchiveWorkspace(): boolean {
  return Boolean(
    state.session?.user.roles.some((role) => role === "administrator" || role === "leitstellenleiter" || role === "operator")
  );
}

export function renderAdministrationSection(): string {
  const canReadUsers = canAccessSettingsWorkspace();
  return `
    <section class="stack">
      ${renderSettingsAccessSection()}
      ${state.session
        ? canReadUsers
          ? renderSettingsUserSection()
          : renderNotice("Benutzerverwaltung ist nur fuer Administration und Leitstellenleitung sichtbar.")
        : renderNotice("Nach dem Login kann die Benutzerverwaltung im administrativen Bereich geladen werden.")}
    </section>
  `;
}

export function renderSettingsAccessSection(): string {
  return `
    <article class="subcard stack compact">
      ${renderSectionHeader("Zugang und Session", {
        subtitle: "Vorhandene Authentifizierung, Session-Kontext und Statusbedienung bleiben im administrativen Bereich gebuendelt."
      })}
      ${renderLoginSection()}
    </article>
  `;
}

export function renderSettingsUserSection(): string {
  const canEditUsers = canAccessSettingsWorkspace();
  return renderUserAdministration(canEditUsers);
}

function renderUserAdministration(canEditUsers: boolean): string {
  const overview = state.userAdministration;
  if (!overview) {
    return `
      <article class="subcard stack compact">
        ${renderSectionHeader("Benutzerverwaltung", {
          subtitle: "Benutzerpflege bleibt im administrativen Bereich getrennt von Leitstelle, Alarmen und Standorten.",
          actions: `<button type="button" id="refresh-user-administration-button" class="secondary">Benutzer laden</button>`
        })}
        ${renderNotice("Die Identity-Schicht ist vorhanden. Hier werden Liste, Bearbeitung, Rollenpflege und Aktiv/Inaktiv-Verwaltung angeschlossen.")}
      </article>
    `;
  }

  const filteredUsers = getFilteredUsers(overview.users);
  const selectedUser = resolveSelectedUser(filteredUsers, overview.users);

  return `
    <section class="stack">
      <article class="subcard stack compact">
        ${renderSectionHeader("Benutzerverwaltung", {
          subtitle: "Benutzer werden tabellarisch verwaltet und in einer eigenen Detailansicht gepflegt. Operative Alarm- und Operator-Screens bleiben unberuehrt.",
          actions: `
            <button type="button" id="refresh-user-administration-button" class="secondary">Aktualisieren</button>
            ${canEditUsers ? `<button type="button" id="user-administration-create-button">Benutzer anlegen</button>` : ""}
          `
        })}
        <div class="site-management-toolbar">
          <label class="field">
            <span>Suche</span>
            <input id="user-administration-search-input" type="search" value="${escapeHtml(state.userAdministrationSearch)}" placeholder="Name, Benutzername oder E-Mail suchen" />
          </label>
          <label class="field">
            <span>Status</span>
            <select id="user-administration-status-filter">${renderUserStatusFilterOptions()}</select>
          </label>
          <label class="field">
            <span>Rolle</span>
            <select id="user-administration-role-filter">${renderUserRoleFilterOptions()}</select>
          </label>
          <article class="site-management-summary-card">
            <strong>${overview.users.length}</strong>
            <span>Benutzer gesamt</span>
          </article>
        </div>
      </article>
      ${state.userAdministrationView === "detail" && selectedUser
        ? renderSelectedUserDetail(selectedUser, canEditUsers)
        : renderUserList(filteredUsers, canEditUsers)}
      ${canEditUsers && state.userAdministrationCreateMode ? `
        <article class="subcard stack">
          ${renderSectionHeader("Benutzer anlegen", {
            subtitle: "Neue Benutzer werden passend zum vorhandenen lokalen Identity-Modell mit Initialpasswort angelegt."
          })}
          ${renderUserEditorForm(undefined)}
        </article>
      ` : ""}
    </section>
  `;
}

function renderUserList(users: UserAdminRecord[], canEditUsers: boolean): string {
  return `
    <article class="subcard stack compact">
      ${renderSectionHeader("Benutzerliste", {
        subtitle: "Die Liste bleibt kompakt und fuehrt ueber Oeffnen in eine eigene Detailansicht."
      })}
      ${users.length > 0
        ? `
          <div class="site-management-table-wrap">
            <table class="site-management-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Benutzername / E-Mail</th>
                  <th>Primaerrolle</th>
                  <th>Status</th>
                  <th>Praesenz</th>
                  <th>letzte Aktivitaet</th>
                  <th>erstellt am</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                ${users.map((user) => `
                  <tr>
                    <td>${escapeHtml(user.displayName)}</td>
                    <td>${escapeHtml(user.username)}<br /><span class="muted">${escapeHtml(user.email)}</span></td>
                    <td>${renderPill(formatUserRoleLabel(user.primaryRole))}</td>
                    <td>${renderUserActivationPill(user)}</td>
                    <td>${renderUserPresencePill(user)}</td>
                    <td>${formatTimestamp(user.lastStatusChangeAt)}</td>
                    <td>${formatTimestamp(user.createdAt)}</td>
                    <td><button type="button" class="secondary user-administration-select-button" data-user-id="${user.id}">${canEditUsers ? "Bearbeiten" : "Oeffnen"}</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `
        : renderEmptyState("Keine Benutzer passend zu Suche oder Filter gefunden.")}
    </article>
  `;
}

function renderSelectedUserDetail(user: UserAdminRecord, canEditUsers: boolean): string {
  return `
    <article class="subcard stack">
      ${renderSectionHeader(user.displayName, {
        subtitle: `${user.username} | ${user.email}`,
        pills: [
          renderUserActivationPill(user),
          renderUserPresencePill(user),
          renderPill(formatUserRoleLabel(user.primaryRole))
        ],
        actions: `
          <button type="button" id="user-administration-back-button" class="secondary">Zur Liste</button>
          ${canEditUsers && state.selectedAdministrationUserEditorId !== user.id ? `<button type="button" class="secondary user-administration-edit-button" data-user-id="${user.id}">Bearbeiten</button>` : ""}
          ${canEditUsers ? renderUserActivationToggleButton(user) : ""}
        `
      })}
      <article class="subcard stack compact">
        ${renderSectionHeader("Benutzerdaten", {
          subtitle: "Anzeige, Rollen und Aktivstatus bleiben im administrativen Bereich zentral gepflegt."
        })}
        <div class="site-management-table-wrap">
          <table class="site-management-detail-table">
            <tbody>
              <tr><th>Name</th><td>${escapeHtml(user.displayName)}</td><th>Benutzername</th><td>${escapeHtml(user.username)}</td></tr>
              <tr><th>E-Mail</th><td>${escapeHtml(user.email)}</td><th>Primaerrolle</th><td>${escapeHtml(formatUserRoleLabel(user.primaryRole))}</td></tr>
              <tr><th>Aktiv/Inaktiv</th><td>${renderUserActivationPill(user)}</td><th>Operativer Status</th><td>${renderUserPresencePill(user)}</td></tr>
              <tr><th>Rollen</th><td colspan="3">${user.roles.map((role) => renderPill(formatUserRoleLabel(role))).join(" ")}</td></tr>
              <tr><th>Letzte Aktivitaet</th><td>${formatTimestamp(user.lastStatusChangeAt)}</td><th>Erstellt</th><td>${formatTimestamp(user.createdAt)}</td></tr>
            </tbody>
          </table>
        </div>
      </article>
      ${canEditUsers && state.selectedAdministrationUserEditorId === user.id ? `
        <article class="subcard stack">
          ${renderSectionHeader("Benutzer bearbeiten", {
            subtitle: "Stammdaten, Rollen und Kontostatus werden im bestehenden Editor aktualisiert."
          })}
          ${renderUserEditorForm(user)}
        </article>
      ` : ""}
    </article>
  `;
}

function renderUserEditorForm(user: UserAdminRecord | undefined): string {
  const selectedRoles = user ? user.roles : [userAdministrationRoleOptions[0]!];
  return `
    <form id="user-administration-form" class="subcard stack" data-ui-preserve-form="true">
      <input type="hidden" name="id" value="${escapeHtml(user?.id ?? "")}" />
      <label class="field"><span>Anzeigename</span><input name="displayName" value="${escapeHtml(user?.displayName ?? "")}" required /></label>
      <div class="detail-grid">
        <label class="field"><span>Benutzername</span><input name="username" value="${escapeHtml(user?.username ?? "")}" required /></label>
        <label class="field"><span>E-Mail</span><input name="email" type="email" value="${escapeHtml(user?.email ?? "")}" required /></label>
        <label class="field"><span>Primaerrolle</span><select name="primaryRole">${userAdministrationRoleOptions.map((role) => renderOption(role, formatUserRoleLabel(role), (user?.primaryRole ?? selectedRoles[0]!) === role)).join("")}</select></label>
        <label class="field"><span>Kontostatus</span><select name="isActive">${renderOption("true", "aktiv", user?.isActive !== false)}${renderOption("false", "inaktiv", user?.isActive === false)}</select></label>
      </div>
      <fieldset class="user-administration-role-fieldset">
        <legend>Rollen</legend>
        <div class="user-administration-role-grid">
          ${userAdministrationRoleOptions.map((role) => `
            <label class="user-administration-role-option">
              <input type="checkbox" name="roles" value="${role}"${selectedRoles.includes(role) ? " checked" : ""} />
              <span>${escapeHtml(formatUserRoleLabel(role))}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
      <label class="field">
        <span>${user ? "Neues Passwort (optional)" : "Initialpasswort"}</span>
        <input name="password" type="password" ${user ? "" : "required"} autocomplete="${user ? "new-password" : "new-password"}" />
      </label>
      ${user
        ? renderNotice("Deaktivieren/Reaktivieren ist zusaetzlich als sichtbare Aktion im Detailkopf verfuegbar. Die Formularaenderung bleibt fuer groessere Aktualisierungen erhalten.", "default", true)
        : renderNotice("Neue Benutzer werden passend zum bestehenden lokalen Login-Modell mit Initialpasswort angelegt.", "default", true)}
      <div class="actions">
        <button type="submit">${user ? "Benutzer speichern" : "Benutzer anlegen"}</button>
        <button type="button" id="user-administration-cancel-edit-button" class="secondary">Abbrechen</button>
      </div>
    </form>
  `;
}

function getFilteredUsers(users: UserAdminRecord[]): UserAdminRecord[] {
  const search = state.userAdministrationSearch.trim().toLowerCase();
  return users.filter((user) => {
    const matchesSearch = search.length === 0
      || user.displayName.toLowerCase().includes(search)
      || user.username.toLowerCase().includes(search)
      || user.email.toLowerCase().includes(search);
    const matchesStatus = state.userAdministrationStatusFilter === "all"
      || (state.userAdministrationStatusFilter === "active" && user.isActive)
      || (state.userAdministrationStatusFilter === "inactive" && !user.isActive);
    const matchesRole = state.userAdministrationRoleFilter === "all"
      || user.roles.includes(state.userAdministrationRoleFilter);
    return matchesSearch && matchesStatus && matchesRole;
  });
}

function resolveSelectedUser(filteredUsers: UserAdminRecord[], allUsers: UserAdminRecord[]): UserAdminRecord | undefined {
  if (!state.selectedAdministrationUserId) {
    return filteredUsers[0] ?? allUsers[0];
  }
  return allUsers.find((user) => user.id === state.selectedAdministrationUserId) ?? filteredUsers[0] ?? allUsers[0];
}

function renderUserStatusFilterOptions(): string {
  return [
    renderOption("all", "alle Kontostati", state.userAdministrationStatusFilter === "all"),
    renderOption("active", "aktiv", state.userAdministrationStatusFilter === "active"),
    renderOption("inactive", "inaktiv", state.userAdministrationStatusFilter === "inactive")
  ].join("");
}

function renderUserRoleFilterOptions(): string {
  return [
    renderOption("all", "alle Rollen", state.userAdministrationRoleFilter === "all"),
    ...userAdministrationRoleOptions.map((role) => renderOption(role, formatUserRoleLabel(role), state.userAdministrationRoleFilter === role))
  ].join("");
}

function renderUserActivationPill(user: UserAdminRecord): string {
  return renderPill(user.isActive ? "aktiv" : "inaktiv", user.isActive ? "user-account-active" : "user-account-inactive");
}

function renderUserPresencePill(user: UserAdminRecord): string {
  return renderPill(formatUserStatusLabel(user.status), `user-presence-${user.status}`);
}

function renderUserActivationToggleButton(user: UserAdminRecord): string {
  return `<button type="button" class="secondary user-administration-toggle-active-button${user.isActive ? " user-administration-deactivate-button" : ""}" data-user-id="${user.id}">${user.isActive ? "Deaktivieren" : "Reaktivieren"}</button>`;
}
