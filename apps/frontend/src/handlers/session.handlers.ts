import type { AppHandlers } from "../actions/events.js";
import type { HandlerRuntime } from "../actions/handler-runtime.js";
import type { LoginMode, LoginResponse, SessionInfo } from "@leitstelle/contracts";

import {
  createOperatorLayoutPreset,
  defaultOperatorLayoutDraftName,
  loadPersistedOperatorLayoutBundle
} from "../operator-layout.js";
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
): Pick<AppHandlers, "handleLogin" | "handleLogout" | "handleLoginModeChange"> & { hydrateSession: () => Promise<void> } {
  return {
    handleLoginModeChange(mode: string): void {
      state.loginMode = mode === "kiosk_code" ? "kiosk_code" : "password";
      deps.render();
    },
    async hydrateSession(): Promise<void> {
      const token = localStorage.getItem(storageKey);
      if (!token) return;
      deps.setBusyState("session", "Session wird geladen");
      try {
        const response = await apiRequest<{ session: SessionInfo }>("/api/v1/auth/session", { method: "GET" });
        deps.resetAlarmSoundTracking();
        state.session = response.session;
        const persistedLayout = loadPersistedOperatorLayoutBundle(response.session.user.id);
        state.operatorLayout = persistedLayout?.layout ?? createOperatorLayoutPreset("two-screen");
        state.operatorLayoutProfiles = persistedLayout?.profiles ?? [];
        state.operatorLayoutDraftName = defaultOperatorLayoutDraftName();
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
      const loginMode = (String(formData.get("mode") ?? state.loginMode) === "kiosk_code" ? "kiosk_code" : "password") as LoginMode;
      deps.setBusyState("login", "Login laeuft");
      try {
        const response = await apiRequest<LoginResponse>("/api/v1/auth/login", {
          method: "POST",
          body: JSON.stringify({
            mode: loginMode,
            ...(loginMode === "kiosk_code"
              ? { kioskCode: String(formData.get("kioskCode") ?? "") }
              : {
                  identifier: String(formData.get("identifier") ?? ""),
                  password: String(formData.get("password") ?? "")
                })
          })
        });
        deps.resetAlarmSoundTracking();
        state.session = response.session;
        const persistedLayout = loadPersistedOperatorLayoutBundle(response.session.user.id);
        state.operatorLayout = persistedLayout?.layout ?? createOperatorLayoutPreset("two-screen");
        state.operatorLayoutProfiles = persistedLayout?.profiles ?? [];
        state.operatorLayoutDraftName = defaultOperatorLayoutDraftName();
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
