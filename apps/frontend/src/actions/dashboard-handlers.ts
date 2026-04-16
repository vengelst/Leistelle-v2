/**
 * Laedt und aktualisiert die Dashboard-Uebersicht fuer die operative Startansicht.
 */
import type { DashboardOverview } from "@leitstelle/contracts";

import { apiRequest } from "../api.js";
import { state } from "../state.js";
import type { HandlerRuntime } from "./handler-runtime.js";

type DashboardHandlerDeps = HandlerRuntime;

export function createDashboardHandlers(deps: DashboardHandlerDeps) {
  function buildDashboardSignature(overview: DashboardOverview | null): string {
    if (!overview) {
      return "";
    }

    return JSON.stringify(overview);
  }

  return {
    async fetchDashboard(successMessage: string | null): Promise<void> {
      deps.setBusyState("dashboard", "Dashboard wird geladen");
      try {
        const response = await apiRequest<{ overview: DashboardOverview }>("/api/v1/dashboard/overview", { method: "GET" });
        state.dashboard = response.overview;
        deps.setSuccess(successMessage);
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Dashboard konnte nicht geladen werden.");
      } finally {
        deps.setBusyState("dashboard", null);
      }
    },
    async pollDashboard(): Promise<boolean> {
      const previousSignature = buildDashboardSignature(state.dashboard);
      const response = await apiRequest<{ overview: DashboardOverview }>("/api/v1/dashboard/overview", { method: "GET" });
      const nextSignature = buildDashboardSignature(response.overview);
      if (previousSignature === nextSignature) {
        return false;
      }
      state.dashboard = response.overview;
      return true;
    }
  };
}
