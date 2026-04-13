import type { AppHandlers } from "../actions/events.js";
import type { HandlerRuntime } from "../actions/handler-runtime.js";
import type { LoginResponse, SessionInfo } from "@leitstelle/contracts";

import { apiRequest, storageKey } from "../api.js";
import { resetSessionScopedState, state } from "../state.js";
import type { WorkspaceRouter } from "../navigation/router.js";

type SessionHandlerDeps = HandlerRuntime & {
  refreshWorkspace: (successMessage: string | null) => Promise<void>;
  resetAlarmSoundTracking: () => void;
  router: WorkspaceRouter;
};

export function createSessionHandlers(
  deps: SessionHandlerDeps
): Pick<AppHandlers, "handleLogin" | "handleLogout"> & { hydrateSession: () => Promise<void> } {
  return {
    async hydrateSession(): Promise<void> {
      const token = localStorage.getItem(storageKey);
      if (!token) return;
      deps.setBusyState("session", "Session wird geladen");
      try {
        const response = await apiRequest<{ session: SessionInfo }>("/api/v1/auth/session", { method: "GET" });
        deps.resetAlarmSoundTracking();
        state.session = response.session;
        deps.setSuccess("Vorhandene Session geladen.");
        await deps.refreshWorkspace(null);
      } catch (error) {
        localStorage.removeItem(storageKey);
        deps.resetAlarmSoundTracking();
        resetSessionScopedState();
        deps.router.navigateWorkspace("dashboard");
        deps.setFailure(error instanceof Error ? error.message : "Session konnte nicht geladen werden.");
      } finally {
        deps.setBusyState("session", null);
      }
    },
    async handleLogin(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      deps.setBusyState("login", "Login laeuft");
      try {
        const response = await apiRequest<LoginResponse>("/api/v1/auth/login", {
          method: "POST",
          body: JSON.stringify({
            identifier: String(formData.get("identifier") ?? ""),
            password: String(formData.get("password") ?? "")
          })
        });
        deps.resetAlarmSoundTracking();
        state.session = response.session;
        deps.setSuccess("Login erfolgreich.");
        localStorage.setItem(storageKey, response.session.token);
        form.reset();
        await deps.refreshWorkspace(null);
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Login fehlgeschlagen.");
      } finally {
        deps.setBusyState("login", null);
      }
    },
    async handleLogout(): Promise<void> {
      deps.setBusyState("logout", "Logout laeuft");
      try {
        await apiRequest<{ loggedOut: true }>("/api/v1/auth/logout", { method: "POST", body: JSON.stringify({}) });
        localStorage.removeItem(storageKey);
        deps.resetAlarmSoundTracking();
        resetSessionScopedState();
        deps.router.navigateWorkspace("dashboard");
        deps.setSuccess("Logout erfolgreich.");
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Logout fehlgeschlagen.");
      } finally {
        deps.setBusyState("logout", null);
      }
    }
  };
}
