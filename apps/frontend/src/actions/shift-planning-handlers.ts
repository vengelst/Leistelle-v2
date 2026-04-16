/**
 * Kapselt Laden, Filtern und Bearbeiten der Schichtplanung im Frontend.
 */
import type { ShiftPlanningOverview, ShiftPlanningState, ShiftUpsertInput } from "@leitstelle/contracts";

import type { AppHandlers } from "./events.js";
import type { HandlerRuntime } from "./handler-runtime.js";
import { apiRequest } from "../api.js";
import { defaultShiftPlanningFilter, shiftPlanningPeriodOptions, shiftPlanningStateOptions, state } from "../state.js";
import { normalizeOptionalField, readSelectValue } from "../utils.js";

type ShiftPlanningHandlerDeps = HandlerRuntime;

export function createShiftPlanningHandlers(
  deps: ShiftPlanningHandlerDeps
): Pick<
  AppHandlers,
  | "handleShiftPlanningFilterSubmit"
  | "handleShiftPlanningReset"
  | "handleShiftPlanningSubmit"
  | "handleShiftPlanningEdit"
  | "handleShiftPlanningEditorReset"
> & {
  fetchShiftPlanning: (successMessage: string | null) => Promise<void>;
  pollShiftPlanning: () => Promise<boolean>;
} {
  function buildShiftPlanningSignature(overview: ShiftPlanningOverview | null): string {
    if (!overview) {
      return "";
    }

    return JSON.stringify(overview);
  }

  function buildShiftPlanningQuery(): string {
    const query = new URLSearchParams();
    query.set("period", state.shiftPlanningFilter.period);
    if (state.shiftPlanningFilter.dateFrom) query.set("dateFrom", state.shiftPlanningFilter.dateFrom);
    if (state.shiftPlanningFilter.dateTo) query.set("dateTo", state.shiftPlanningFilter.dateTo);
    if (state.shiftPlanningFilter.planningState) query.set("planningState", state.shiftPlanningFilter.planningState);
    if (state.shiftPlanningFilter.userId) query.set("userId", state.shiftPlanningFilter.userId);
    return query.toString();
  }

  async function fetchShiftPlanning(successMessage: string | null): Promise<void> {
    deps.setBusyState("shift-planning", "Schichtplanung wird geladen");
    try {
      const response = await apiRequest<{ overview: ShiftPlanningOverview }>(`/api/v1/shift-planning/overview?${buildShiftPlanningQuery()}`, { method: "GET" });
      state.shiftPlanning = response.overview;
      normalizeSelectedShift();
      deps.setSuccess(successMessage);
    } catch (error) {
      deps.setFailure(error instanceof Error ? error.message : "Schichtplanung konnte nicht geladen werden.");
    } finally {
      deps.setBusyState("shift-planning", null);
    }
  }

  function normalizeSelectedShift(): void {
    if (!state.selectedShiftPlanningShiftId) {
      return;
    }
    const exists = state.shiftPlanning?.shifts.some((shift) => shift.id === state.selectedShiftPlanningShiftId);
    if (!exists) {
      delete state.selectedShiftPlanningShiftId;
    }
  }

  function toIsoDateTime(rawValue: FormDataEntryValue | null): string {
    const value = String(rawValue ?? "").trim();
    const parsed = new Date(value);
    return parsed.toISOString();
  }

  return {
    fetchShiftPlanning,
    async pollShiftPlanning(): Promise<boolean> {
      const previousSignature = buildShiftPlanningSignature(state.shiftPlanning);
      const response = await apiRequest<{ overview: ShiftPlanningOverview }>(`/api/v1/shift-planning/overview?${buildShiftPlanningQuery()}`, { method: "GET" });
      const nextSignature = buildShiftPlanningSignature(response.overview);
      if (previousSignature === nextSignature) {
        return false;
      }
      state.shiftPlanning = response.overview;
      normalizeSelectedShift();
      return true;
    },
    async handleShiftPlanningFilterSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      const period = readSelectValue(formData, "period", shiftPlanningPeriodOptions);
      const planningState = normalizeOptionalField(formData.get("planningState")) as ShiftPlanningState | undefined;
      const userId = normalizeOptionalField(formData.get("userId"));
      const dateFrom = normalizeOptionalField(formData.get("dateFrom"));
      const dateTo = normalizeOptionalField(formData.get("dateTo"));

      state.shiftPlanningFilter = {
        period,
        ...(planningState ? { planningState } : {}),
        ...(userId ? { userId } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {})
      };
      await fetchShiftPlanning("Schichtplanung geladen.");
    },
    async handleShiftPlanningReset(): Promise<void> {
      state.shiftPlanningFilter = { ...defaultShiftPlanningFilter };
      await fetchShiftPlanning("Schichtplanung geladen.");
    },
    handleShiftPlanningEdit(shiftId: string): void {
      state.selectedShiftPlanningShiftId = shiftId;
      deps.render();
    },
    handleShiftPlanningEditorReset(): void {
      delete state.selectedShiftPlanningShiftId;
      deps.render();
    },
    async handleShiftPlanningSubmit(event: SubmitEvent): Promise<void> {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      deps.setBusyState("shift-planning-save", "Schicht wird gespeichert");
      try {
        const formData = new FormData(form);
        const payload: ShiftUpsertInput = {
          ...(normalizeOptionalField(formData.get("id")) ? { id: normalizeOptionalField(formData.get("id"))! } : {}),
          title: String(formData.get("title") ?? "").trim(),
          startsAt: toIsoDateTime(formData.get("startsAt")),
          endsAt: toIsoDateTime(formData.get("endsAt")),
          assignmentUserIds: formData.getAll("assignmentUserIds").map((value) => String(value).trim()).filter((value) => value.length > 0),
          ...(normalizeOptionalField(formData.get("handoverNote")) ? { handoverNote: normalizeOptionalField(formData.get("handoverNote"))! } : {})
        };
        await apiRequest<{ overview: ShiftPlanningOverview }>("/api/v1/shift-planning/shifts", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        delete state.selectedShiftPlanningShiftId;
        await fetchShiftPlanning("Schicht gespeichert.");
        form.reset();
      } catch (error) {
        deps.setFailure(error instanceof Error ? error.message : "Schicht konnte nicht gespeichert werden.");
      } finally {
        deps.setBusyState("shift-planning-save", null);
      }
    }
  };
}
