import type { AppHandlers } from "../actions/events.js";
import type { HandlerRuntime } from "../actions/handler-runtime.js";
import type { AuthenticatedUser, UserAdministrationOverview, UserRole, UserUpsertInput } from "@leitstelle/contracts";

import { apiRequest } from "../api.js";
import { state, userAdministrationRoleOptions } from "../state.js";
import { normalizeOptionalField } from "../utils.js";

type AdminHandlerDeps = HandlerRuntime;

export function createAdminHandlers(
  deps: AdminHandlerDeps
): Pick<
  AppHandlers,
  | "handleStatusAction"
  | "fetchUserAdministration"
  | "handleUserAdministrationSearchInput"
  | "handleUserAdministrationStatusFilterChange"
  | "handleUserAdministrationRoleFilterChange"
  | "handleUserAdministrationSelectUser"
  | "handleUserAdministrationBackToList"
  | "handleUserAdministrationCreateUser"
  | "handleUserAdministrationEditUser"
  | "handleUserAdministrationCancelEdit"
  | "handleUserAdministrationSubmit"
  | "handleUserAdministrationToggleActive"
> {
  function normalizeUserAdministrationSelection(overview: UserAdministrationOverview): void {
    const availableUserIds = new Set(overview.users.map((user) => user.id));
    if (state.selectedAdministrationUserId && !availableUserIds.has(state.selectedAdministrationUserId)) {
      delete state.selectedAdministrationUserId;
    }
    if (state.selectedAdministrationUserEditorId && !availableUserIds.has(state.selectedAdministrationUserEditorId)) {
      delete state.selectedAdministrationUserEditorId;
    }
    if (!state.selectedAdministrationUserId && overview.users[0]) {
      state.selectedAdministrationUserId = overview.users[0].id;
    }
  }

  function syncSessionUserFromAdministration(overview: UserAdministrationOverview): void {
    if (!state.session) {
      return;
    }
    const updatedCurrentUser = overview.users.find((user) => user.id === state.session?.user.id);
    if (!updatedCurrentUser) {
      return;
    }
    state.session = {
      ...state.session,
      user: {
        ...state.session.user,
        username: updatedCurrentUser.username,
        email: updatedCurrentUser.email,
        displayName: updatedCurrentUser.displayName,
        primaryRole: updatedCurrentUser.primaryRole,
        roles: [...updatedCurrentUser.roles],
        isActive: updatedCurrentUser.isActive,
        status: updatedCurrentUser.status,
        lastStatusChangeAt: updatedCurrentUser.lastStatusChangeAt,
        ...(updatedCurrentUser.pauseReason ? { pauseReason: updatedCurrentUser.pauseReason } : {})
      }
    };
  }

  return {
    async handleStatusAction(path: string, successMessage: string): Promise<void> {
      deps.setBusyState("status", "Status wird aktualisiert");
      try {
        const response = await apiRequest<{ user: AuthenticatedUser }>(path, { method: "POST", body: JSON.stringify({}) });
        if (state.session) {
          state.session = { ...state.session, user: response.user };
        }
        deps.setSuccess(successMessage);
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Statuswechsel fehlgeschlagen.");
      } finally {
        deps.setBusyState("status", null);
      }
    },
    async fetchUserAdministration(successMessage: string | null): Promise<void> {
      deps.setBusyState("user-administration", "Benutzerverwaltung wird geladen");
      try {
        const response = await apiRequest<{ overview: UserAdministrationOverview }>("/api/v1/admin/users/overview", { method: "GET" });
        state.userAdministration = response.overview;
        normalizeUserAdministrationSelection(response.overview);
        syncSessionUserFromAdministration(response.overview);
        deps.setSuccess(successMessage);
      } catch (error) {
        state.userAdministration = null;
        deps.setFailure(error instanceof Error ? error.message : "Benutzerverwaltung konnte nicht geladen werden.");
      } finally {
        deps.setBusyState("user-administration", null);
      }
    },
    handleUserAdministrationSearchInput(value: string): void {
      state.userAdministrationSearch = value;
      deps.render();
    },
    handleUserAdministrationStatusFilterChange(value: string): void {
      state.userAdministrationStatusFilter = value === "active" || value === "inactive" ? value : "all";
      deps.render();
    },
    handleUserAdministrationRoleFilterChange(value: string): void {
      state.userAdministrationRoleFilter = value === "all" || userAdministrationRoleOptions.includes(value as UserRole)
        ? value as UserRole | "all"
        : "all";
      deps.render();
    },
    handleUserAdministrationSelectUser(userId: string): void {
      if (!userId) return;
      state.selectedAdministrationUserId = userId;
      state.userAdministrationView = "detail";
      state.userAdministrationCreateMode = false;
      delete state.selectedAdministrationUserEditorId;
      deps.render();
    },
    handleUserAdministrationBackToList(): void {
      state.userAdministrationView = "list";
      state.userAdministrationCreateMode = false;
      delete state.selectedAdministrationUserEditorId;
      deps.render();
    },
    handleUserAdministrationCreateUser(): void {
      state.userAdministrationView = "list";
      state.userAdministrationCreateMode = true;
      delete state.selectedAdministrationUserEditorId;
      deps.render();
    },
    handleUserAdministrationEditUser(userId: string): void {
      if (!userId) return;
      state.selectedAdministrationUserId = userId;
      state.selectedAdministrationUserEditorId = userId;
      state.userAdministrationCreateMode = false;
      state.userAdministrationView = "detail";
      deps.render();
      requestAnimationFrame(() => {
        document.querySelector<HTMLInputElement>("#user-administration-form input[name=\"displayName\"]")?.focus();
      });
    },
    handleUserAdministrationCancelEdit(): void {
      state.userAdministrationCreateMode = false;
      delete state.selectedAdministrationUserEditorId;
      deps.render();
    },
    async handleUserAdministrationSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      const userId = normalizeOptionalField(formData.get("id"));
      const roles = formData
        .getAll("roles")
        .map((entry) => String(entry))
        .filter((role): role is UserRole => userAdministrationRoleOptions.includes(role as UserRole));

      if (roles.length === 0) {
        deps.setFailure("Mindestens eine Rolle muss ausgewaehlt sein.");
        return;
      }

      const password = normalizeOptionalField(formData.get("password"));
      const payload: UserUpsertInput = {
        ...(userId ? { id: userId } : {}),
        username: String(formData.get("username") ?? ""),
        email: String(formData.get("email") ?? ""),
        displayName: String(formData.get("displayName") ?? ""),
        primaryRole: (String(formData.get("primaryRole") ?? roles[0]) as UserRole),
        roles,
        isActive: String(formData.get("isActive") ?? "true") === "true",
        ...(password ? { password } : {})
      };

      deps.setBusyState("user-administration-save", "Benutzer wird gespeichert");
      try {
        const response = await apiRequest<{ overview: UserAdministrationOverview }>("/api/v1/admin/users", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        state.userAdministration = response.overview;
        normalizeUserAdministrationSelection(response.overview);
        syncSessionUserFromAdministration(response.overview);
        state.userAdministrationCreateMode = false;
        delete state.selectedAdministrationUserEditorId;
        const selectedUser = response.overview.users.find((user) =>
          userId ? user.id === userId : user.username === payload.username
        );
        if (selectedUser) {
          state.selectedAdministrationUserId = selectedUser.id;
          state.userAdministrationView = "detail";
        }
        form.reset();
        deps.setSuccess(userId ? "Benutzer gespeichert." : "Benutzer angelegt.");
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Benutzer konnte nicht gespeichert werden.");
      } finally {
        deps.setBusyState("user-administration-save", null);
      }
    },
    async handleUserAdministrationToggleActive(userId: string): Promise<void> {
      if (!state.userAdministration) {
        deps.setFailure("Benutzerverwaltung ist noch nicht geladen.");
        return;
      }
      const selectedUser = state.userAdministration.users.find((user) => user.id === userId);
      if (!selectedUser) {
        deps.setFailure("Benutzer konnte nicht gefunden werden.");
        return;
      }
      const nextState = !selectedUser.isActive;
      const confirmMessage = nextState
        ? `Benutzer "${selectedUser.displayName}" wirklich reaktivieren?`
        : `Benutzer "${selectedUser.displayName}" wirklich deaktivieren?`;
      if (!window.confirm(confirmMessage)) {
        return;
      }

      deps.setBusyState("user-administration-toggle", "Benutzerstatus wird aktualisiert");
      try {
        const response = await apiRequest<{ overview: UserAdministrationOverview }>(`/api/v1/admin/users/${userId}/activation`, {
          method: "POST",
          body: JSON.stringify({ isActive: nextState })
        });
        state.userAdministration = response.overview;
        normalizeUserAdministrationSelection(response.overview);
        syncSessionUserFromAdministration(response.overview);
        state.selectedAdministrationUserId = userId;
        state.userAdministrationView = "detail";
        deps.setSuccess(nextState ? "Benutzer reaktiviert." : "Benutzer deaktiviert.");
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Benutzerstatus konnte nicht aktualisiert werden.");
      } finally {
        deps.setBusyState("user-administration-toggle", null);
      }
    }
  };
}
