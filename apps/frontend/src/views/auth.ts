import type { UserAdminRecord, UserRole } from "@leitstelle/contracts";

import { state, userAdministrationRoleOptions } from "../state.js";
import { escapeHtml, formatTimestamp } from "../utils.js";
import { formatUserRoleLabel, formatUserStatusLabel, renderEmptyState, renderNotice, renderOption, renderPill, renderSectionHeader, renderUserFacts } from "./common.js";

export function renderLoginSection(): string {
  const isKioskLogin = state.loginMode === "kiosk_code";
  return `
    <form id="login-form" class="stack" data-ui-preserve-form="true">
      <input type="hidden" name="mode" value="${state.loginMode}" />
      <div class="login-mode-switch" role="tablist" aria-label="Anmeldeart">
        <button
          type="button"
          class="secondary login-mode-button${!isKioskLogin ? " selected" : ""}"
          data-login-mode="password"
          aria-pressed="${!isKioskLogin}"
        >Login + Passwort</button>
        <button
          type="button"
          class="secondary login-mode-button${isKioskLogin ? " selected" : ""}"
          data-login-mode="kiosk_code"
          aria-pressed="${isKioskLogin}"
        >Kiosk-Code</button>
      </div>
      ${isKioskLogin
        ? `
          <label class="field">
            <span>Kiosk-Code</span>
            <input name="kioskCode" inputmode="numeric" autocomplete="one-time-code" required />
          </label>
        `
        : `
          <label class="field"><span>Benutzername oder E-Mail</span><input name="identifier" autocomplete="username" required /></label>
          <label class="field">
            <span>Passwort</span>
            <div class="password-field">
              <input id="login-password-input" type="password" name="password" autocomplete="current-password" required />
              <button
                type="button"
                id="login-password-toggle-button"
                class="secondary password-toggle-button icon-only-button"
                data-password-visible="false"
                aria-controls="login-password-input"
                aria-label="Passwort anzeigen"
                aria-pressed="false"
              >${renderEyeIcon()}</button>
            </div>
          </label>
        `}
      <button type="submit">${isKioskLogin ? "Mit Kiosk-Code anmelden" : "Anmelden"}</button>
    </form>
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
      <section class="login-shell-layout login-shell-layout-single">
        <article class="login-hero-card login-unified-card">
          <div class="actions login-shell-actions login-shell-actions-top">
            <div>
              <p class="eyebrow">Leitstelle</p>
              <h1>Leitstellensoftware</h1>
            </div>
            <button
              type="button"
              id="theme-toggle-button"
              class="secondary theme-toggle-button icon-only-button"
              aria-label="${state.themeMode === "dark" ? "Auf helles Theme umschalten" : "Auf dunkles Theme umschalten"}"
              title="${state.themeMode === "dark" ? "Hell" : "Dunkel"}"
            >${state.themeMode === "dark" ? "☀" : "☾"}</button>
          </div>
          ${renderSectionHeader("Anmelden", {})}
          ${renderLoginSection()}
          ${pendingLabel ? renderNotice(pendingLabel, "default", true) : ""}
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
      ${renderUserAccessPolicyCard(canEditUsers)}
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
          subtitle: ""
        })}
        <div class="site-management-table-wrap">
          <table class="site-management-detail-table">
            <tbody>
              <tr><th>Name</th><td>${escapeHtml(user.displayName)}</td><th>Benutzername</th><td>${escapeHtml(user.username)}</td></tr>
              <tr><th>E-Mail</th><td>${escapeHtml(user.email)}</td><th>Primaerrolle</th><td>${escapeHtml(formatUserRoleLabel(user.primaryRole))}</td></tr>
              <tr><th>Aktiv/Inaktiv</th><td>${renderUserActivationPill(user)}</td><th>Operativer Status</th><td>${renderUserPresencePill(user)}</td></tr>
              <tr><th>Rollen</th><td colspan="3">${user.roles.map((role) => renderPill(formatUserRoleLabel(role))).join(" ")}</td></tr>
              <tr><th>Kiosk-Code</th><td>${user.hasKioskCode ? "gesetzt" : "-"}</td><th>Bild</th><td>${renderUserAvatarPreview(user.avatarDataUrl, user.displayName, "user-admin-avatar-preview")}</td></tr>
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
  const accessSettings = state.overview?.globalSettings ?? {
    monitoringIntervalSeconds: 90,
    failureThreshold: 3,
    uiDensity: "comfortable",
    escalationProfile: "standard",
    workflowProfile: "default",
    passwordMinLength: 8,
    kioskCodeLength: 6
  };
  return `
    <form id="user-administration-form" class="subcard stack" data-ui-preserve-form="true">
      <input type="hidden" name="id" value="${escapeHtml(user?.id ?? "")}" />
      <input type="hidden" name="avatarDataUrl" value="${escapeHtml(user?.avatarDataUrl ?? "")}" />
      <input type="hidden" name="avatarRemove" value="false" />
      <label class="field"><span>Anzeigename</span><input name="displayName" value="${escapeHtml(user?.displayName ?? "")}" required /></label>
      <div class="detail-grid">
        <label class="field"><span>Benutzername</span><input name="username" value="${escapeHtml(user?.username ?? "")}" required /></label>
        <label class="field"><span>E-Mail</span><input name="email" type="email" value="${escapeHtml(user?.email ?? "")}" required /></label>
        <label class="field"><span>Primaerrolle</span><select name="primaryRole">${userAdministrationRoleOptions.map((role) => renderOption(role, formatUserRoleLabel(role), (user?.primaryRole ?? selectedRoles[0]!) === role)).join("")}</select></label>
        <label class="field"><span>Kontostatus</span><select name="isActive">${renderOption("true", "aktiv", user?.isActive !== false)}${renderOption("false", "inaktiv", user?.isActive === false)}</select></label>
      </div>
      <div class="detail-grid user-avatar-editor-grid">
        <div class="field stack compact">
          <span>Benutzerbild</span>
          <div class="user-avatar-editor">
            ${renderUserAvatarPreview(user?.avatarDataUrl, user?.displayName ?? "Benutzer", "user-admin-avatar-preview user-admin-avatar-preview-large")}
            <div class="stack compact">
              <input type="file" name="avatarFile" accept="image/*" class="user-avatar-file-input" />
              <button type="button" class="secondary user-avatar-remove-button">Bild entfernen</button>
            </div>
          </div>
        </div>
        <label class="field">
          <span>Kiosk-Code (optional, ${accessSettings.kioskCodeLength} Zeichen)</span>
          <input name="kioskCode" inputmode="numeric" autocomplete="off" placeholder="${user?.hasKioskCode ? "Neu setzen oder leer lassen" : "Kiosk-Code"}" />
        </label>
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
        <span>${user ? `Neues Passwort (optional, mind. ${accessSettings.passwordMinLength} Zeichen)` : `Initialpasswort (mind. ${accessSettings.passwordMinLength} Zeichen)`}</span>
        <input name="password" type="password" ${user ? "" : "required"} autocomplete="${user ? "new-password" : "new-password"}" />
      </label>
      ${user
        ? renderNotice("Passwort, Kiosk-Code, Bild, Rollen und Aktivstatus werden im bestehenden Benutzerpfad gepflegt.", "default", true)
        : renderNotice("Neue Benutzer werden mit Passwort angelegt; Kiosk-Code und Bild koennen direkt mit gepflegt werden.", "default", true)}
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

function renderUserAccessPolicyCard(canEditUsers: boolean): string {
  const defaults = state.overview?.globalSettings ?? {
    monitoringIntervalSeconds: 90,
    failureThreshold: 3,
    uiDensity: "comfortable",
    escalationProfile: "standard",
    workflowProfile: "default",
    passwordMinLength: 8,
    kioskCodeLength: 6
  };

  return canEditUsers
    ? `
      <article class="subcard stack compact">
        ${renderSectionHeader("Benutzerzugang", {})}
        <form id="global-settings-form" class="subcard stack compact" data-ui-preserve-form="true">
          <input type="hidden" name="monitoringIntervalSeconds" value="${defaults.monitoringIntervalSeconds}" />
          <input type="hidden" name="failureThreshold" value="${defaults.failureThreshold}" />
          <input type="hidden" name="uiDensity" value="${defaults.uiDensity}" />
          <input type="hidden" name="escalationProfile" value="${defaults.escalationProfile}" />
          <input type="hidden" name="workflowProfile" value="${defaults.workflowProfile}" />
          <div class="detail-grid">
            <label class="field"><span>Passwortlaenge</span><input name="passwordMinLength" type="number" min="4" max="128" value="${defaults.passwordMinLength}" required /></label>
            <label class="field"><span>Kiosk-Code-Laenge</span><input name="kioskCodeLength" type="number" min="4" max="24" value="${defaults.kioskCodeLength}" required /></label>
          </div>
          <button type="submit">Zugangsregeln speichern</button>
        </form>
      </article>
    `
    : `
      <article class="subcard stack compact">
        ${renderSectionHeader("Benutzerzugang", {})}
        <dl class="facts compact-gap">
          <div><dt>Passwortlaenge</dt><dd>${defaults.passwordMinLength}</dd></div>
          <div><dt>Kiosk-Code-Laenge</dt><dd>${defaults.kioskCodeLength}</dd></div>
        </dl>
      </article>
    `;
}

function renderEyeIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon-eye">
      <path d="M1.5 12s3.6-6 10.5-6 10.5 6 10.5 6-3.6 6-10.5 6S1.5 12 1.5 12Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
    </svg>
  `.trim();
}

function renderUserAvatarPreview(avatarDataUrl: string | undefined, displayName: string, className: string): string {
  if (avatarDataUrl) {
    return `<img src="${escapeHtml(avatarDataUrl)}" alt="Benutzerbild ${escapeHtml(displayName)}" class="${className}" />`;
  }

  const initials = displayName
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";
  return `<span class="${className} user-admin-avatar-fallback" aria-hidden="true">${escapeHtml(initials)}</span>`;
}
